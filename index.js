(function(exports) {
    "use strict";

    try {
        // Safe global context lookup for Revenge / Bunny client engines
        const clientMod = typeof vendetta !== "undefined" ? vendetta : (typeof window !== "undefined" ? window.vendetta : null);
        
        if (!clientMod) {
            console.error("[MediaPlugin] Client engine context wrapper could not be resolved.");
            exports.onLoad = () => {};
            exports.onUnload = () => {};
            return;
        }

        const metro = clientMod.metro;
        const plugin = clientMod.plugin;
        
        const React = metro.common.React;
        const ReactNative = metro.common.ReactNative;

        // Initialize local persistent plugin storage structure securely
        const storage = plugin && plugin.storage ? plugin.storage : {};
        if (!storage.customSources) {
            storage.customSources = {
                sfw: { femboy: [], tomboy: [] },
                nsfw: { femboy: [], tomboy: [] }
            };
        }

        // --- SOURCES STORAGE DEFINITION ---
        const defaultSources = {
            sfw: { femboy: ["femboymemes", "femboysfw"], tomboy: ["tomboy", "AnimeTomboys"] },
            nsfw: { femboy: ["femboy", "traditionalfemboys"], tomboy: ["tomboygf"] }
        };

        const isImage = (url) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
        const isVideo = (url) => /\.(mp4|webm)$/i.test(url);
        
        let activeGuesses = {};
        let myCommands = [];

        // --- EXTERNAL AND LOCAL DATA FETCHER ---
        async function fetchMedia(type, category, mediaType) {
            const defaultSubs = defaultSources[category]?.[type] || [];
            const customSrcs = storage.customSources?.[category]?.[type] || [];
            const allSources = [...defaultSubs, ...customSrcs];
            
            const filter = mediaType === "video" ? isVideo : isImage;
            
            for (let i = 0; i < 15; i++) {
                if (allSources.length === 0) break;
                const randomSrc = allSources[Math.floor(Math.random() * allSources.length)];
                
                try {
                    if (randomSrc.startsWith("http://") || randomSrc.startsWith("https://")) {
                        const res = await fetch(randomSrc);
                        const contentType = res.headers.get("content-type") || "";
                        
                        if (contentType.includes("image/") || contentType.includes("video/")) {
                            if (filter(randomSrc)) return randomSrc;
                            continue;
                        }
                        
                        const data = await res.json();
                        const mediaUrl = data.url || data.file || data.message || data.src || data.image;
                        if (mediaUrl && typeof mediaUrl === "string" && filter(mediaUrl)) return mediaUrl;
                    } else {
                        const res = await fetch("https://meme-api.com/gimme/" + randomSrc);
                        const data = await res.json();
                        if (data && data.url && filter(data.url)) return data.url;
                    }
                } catch (e) { continue; }
            }
            return null;
        }

        // --- EXTENSION LIFECYCLE INITIALIZATION ---
        exports.onLoad = () => {
            const Commands = metro.findByProps("BUILT_IN_COMMANDS");
            
            myCommands = [
                ...["sfw", "nsfw"].flatMap(cat => 
                    ["femboy", "tomboy"].flatMap(type => [
                        {
                            id: `-${cat}-${type}-img`,
                            untranslatedName: cat === "nsfw" ? "nsfw_" + type : type,
                            displayName: cat === "nsfw" ? "nsfw_" + type : type,
                            untranslatedDescription: `Send a ${cat.toUpperCase()} ${type} image`,
                            displayDescription: `Send a ${cat.toUpperCase()} ${type} image`,
                            type: 1, inputType: 0, applicationId: "-1",
                            execute: async (args, ctx) => {
                                const MessageActions = metro.findByProps("sendMessage");
                                const url = await fetchMedia(type, cat, "image");
                                if (!url) return { content: "❌ Could not find an image." };
                                if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                                return {};
                            }
                        },
                        {
                            id: `-${cat}-${type}-vid`,
                            untranslatedName: cat === "nsfw" ? "nsfw_" + type + "_video" : type + "_video",
                            displayName: cat === "nsfw" ? "nsfw_" + type + "_video" : type + "_video",
                            untranslatedDescription: `Send a ${cat.toUpperCase()} ${type} video`,
                            displayDescription: `Send a ${cat.toUpperCase()} ${type} video`,
                            type: 1, inputType: 0, applicationId: "-1",
                            execute: async (args, ctx) => {
                                const MessageActions = metro.findByProps("sendMessage");
                                const url = await fetchMedia(type, cat, "video");
                                if (!url) return { content: "❌ Could not find a video." };
                                if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                                return {};
                            }
                        }
                    ])
                ),
                {
                    id: "-401",
                    untranslatedName: "guess",
                    displayName: "guess",
                    untranslatedDescription: "Guess the character!",
                    displayDescription: "Guess the character!",
                    type: 1, inputType: 0, applicationId: "-1",
                    execute: async (args, ctx) => {
                        const MessageActions = metro.findByProps("sendMessage");
                        const isTomboy = Math.random() > 0.5;
                        const type = isTomboy ? "tomboy" : "femboy";
                        const url = await fetchMedia(type, "sfw", "image");
                        if (!url) return { content: "❌ Could not find an image." };
                        activeGuesses[ctx.channel.id] = type;
                        if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: "📸 **Guess!** Reply with `/answer tomboy` or `/answer femboy`.\n\n" + url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                        return {};
                    }
                },
                {
                    id: "-402",
                    untranslatedName: "answer",
                    displayName: "answer",
                    untranslatedDescription: "Submit your guess",
                    displayDescription: "Submit your guess",
                    type: 1, inputType: 0, applicationId: "-1",
                    options: [{ name: "choice", displayName: "choice", type: 3, required: true, choices: [{name: "tomboy", value: "tomboy"}, {name: "femboy", value: "femboy"}] }],
                    execute: async (args, ctx) => {
                        const MessageActions = metro.findByProps("sendMessage");
                        const userAnswer = args[0].value;
                        const correctAnswer = activeGuesses[ctx.channel.id];
                        if (!correctAnswer) return { content: "No active game! Type `/guess` to start." };
                        const result = (userAnswer === correctAnswer) ? "✅ Correct!" : "❌ Wrong! It was " + correctAnswer + ".";
                        if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: result, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                        delete activeGuesses[ctx.channel.id];
                        return {};
                    }
                }
            ];

            if (Commands && Commands.BUILT_IN_COMMANDS) {
                myCommands.forEach(cmd => {
                    if (!Commands.BUILT_IN_COMMANDS.find(c => c.id === cmd.id)) {
                        Commands.BUILT_IN_COMMANDS.push(cmd);
                    }
                });
            }
        };

        // --- TEARDOWN CLEANUP ---
        exports.onUnload = () => {
            const Commands = metro.findByProps("BUILT_IN_COMMANDS");
            if (Commands && Commands.BUILT_IN_COMMANDS) {
                myCommands.forEach(cmd => {
                    const index = Commands.BUILT_IN_COMMANDS.findIndex(c => c.id === cmd.id);
                    if (index > -1) Commands.BUILT_IN_COMMANDS.splice(index, 1);
                });
            }
        };

        // --- SETTINGS RENDER PANEL ---
        exports.settings = function SettingsView() {
            const [refresh, setRefresh] = React.useState(0);
            const [inputVal, setInputVal] = React.useState("");
            const [cat, setCat] = React.useState("sfw");
            const [type, setType] = React.useState("femboy");

            const forceUpdate = () => setRefresh(r => r + 1);

            const handleAdd = () => {
                if (!inputVal.trim()) return;
                const val = inputVal.trim();
                
                if (!storage.customSources[cat]) storage.customSources[cat] = {};
                if (!storage.customSources[cat][type]) storage.customSources[cat][type] = [];
                
                if (!storage.customSources[cat][type].includes(val)) {
                    storage.customSources[cat][type].push(val);
                }
                
                setInputVal("");
                forceUpdate();
            };

            const handleRemove = (idx) => {
                storage.customSources[cat][type].splice(idx, 1);
                forceUpdate();
            };

            const currentSources = storage.customSources[cat]?.[type] || [];

            const CustomBtn = ({ title, active, onPress, color }) => React.createElement(
                ReactNative.TouchableOpacity,
                { 
                    onPress, 
                    style: { 
                        backgroundColor: color || (active ? "#5865F2" : "#4F545C"), 
                        padding: 10, borderRadius: 8, alignItems: "center", flex: 1, marginHorizontal: 4 
                    } 
                },
                React.createElement(ReactNative.Text, { style: { color: "#FFF", fontWeight: "bold" } }, title)
            );

            return React.createElement(ReactNative.ScrollView, { style: { flex: 1, padding: 16 } },
                React.createElement(ReactNative.Text, { style: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 8 } }, "Add External Sources"),
                React.createElement(ReactNative.Text, { style: { color: "#aaa", fontSize: 13, marginBottom: 16 } }, "Enter a subreddit name OR a dynamic direct link JSON API endpoint."),
                
                React.createElement(ReactNative.View, { style: { flexDirection: "row", marginBottom: 10 } },
                    CustomBtn({ title: "SFW", active: cat === "sfw", onPress: () => setCat("sfw") }),
                    CustomBtn({ title: "NSFW", active: cat === "nsfw", onPress: () => setCat("nsfw") })
                ),
                
                React.createElement(ReactNative.View, { style: { flexDirection: "row", marginBottom: 16 } },
                    CustomBtn({ title: "Femboy", active: type === "femboy", onPress: () => setType("femboy") }),
                    CustomBtn({ title: "Tomboy", active: type === "tomboy", onPress: () => setType("tomboy") })
                ),

                React.createElement(ReactNative.TextInput, {
                    style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#444" },
                    placeholder: "Subreddit or custom API URL...",
                    placeholderTextColor: "#888",
                    value: inputVal,
                    onChangeText: setInputVal
                }),

                CustomBtn({ title: "Add Source", active: true, onPress: handleAdd, color: "#3BA55C" }),

                React.createElement(ReactNative.Text, { style: { color: "#fff", fontSize: 16, fontWeight: "bold", marginTop: 24, marginBottom: 8 } }, `Active Sources [${cat.toUpperCase()} - ${type}]:`),
                
                currentSources.length === 0 
                    ? React.createElement(ReactNative.Text, { style: { color: "#888", fontStyle: "italic" } }, "No custom variants defined.")
                    : currentSources.map((src, idx) => 
                        React.createElement(ReactNative.View, { key: idx, style: { flexDirection: "row", alignItems: "center", backgroundColor: "#222", padding: 10, borderRadius: 8, marginBottom: 8 } },
                            React.createElement(ReactNative.Text, { style: { color: "#ddd", flex: 1, marginRight: 8 }, numberOfLines: 1 }, src),
                            React.createElement(ReactNative.TouchableOpacity, { 
                                onPress: () => handleRemove(idx), 
                                style: { backgroundColor: "#ED4245", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 } 
                            },
                                React.createElement(ReactNative.Text, { style: { color: "#FFF", fontWeight: "bold" } }, "Del")
                            )
                        )
                    )
            );
        };

    } catch (globalError) {
        console.error("[MediaPlugin] Critical error caught handling loader wrapper:", globalError);
    }
})(this.exports || (this.exports = {}));
                                          
