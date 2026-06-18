(function(exports, patcher, metro, storage) {
    "use strict";

    // --- DISCORD INTERNALS ---
    // If these aren't found, we return early to prevent the plugin from crashing on load
    const Commands = metro.findByProps("BUILT_IN_COMMANDS");
    const MessageActions = metro.findByProps("sendMessage");
    const React = metro.findByProps("createElement", "useState");
    const ReactNative = metro.findByProps("ScrollView", "TextInput", "Button");

    if (!Commands || !MessageActions || !React || !ReactNative) {
        console.error("Plugin failed to initialize: Missing required Discord modules.");
        return; 
    }
    
    // --- DEFAULT SOURCES CONFIGURATION ---
    const defaultSources = {
        sfw: {
            femboy: ["femboymemes", "femboysfw"],
            tomboy: ["tomboy", "AnimeTomboys"]
        },
        nsfw: {
            femboy: ["femboy", "traditionalfemboys"],
            tomboy: ["tomboygf"]
        }
    };

    // --- INITIALIZE STORAGE ---
    if (!storage.customSources) {
        storage.customSources = {
            sfw: { femboy: [], tomboy: [] },
            nsfw: { femboy: [], tomboy: [] }
        };
    }

    // --- STRICT MEDIA FILTERS ---
    const isImage = (url) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    const isVideo = (url) => /\.(mp4|webm)$/i.test(url);
    
    let activeGuesses = {};

    // --- MEDIA FETCHER ---
    async function fetchMedia(type, category, mediaType) {
        const defaultSubs = defaultSources[category]?.[type] || [];
        const customSrcs = storage.customSources?.[category]?.[type] || [];
        const allSources = [...defaultSubs, ...customSrcs];
        
        const filter = mediaType === "video" ? isVideo : isImage;
        
        for (let i = 0; i < 15; i++) {
            if (allSources.length === 0) break;
            const randomSrc = allSources[Math.floor(Math.random() * allSources.length)];
            
            try {
                // If it's a custom web API or direct link instead of a subreddit
                if (randomSrc.startsWith("http://") || randomSrc.startsWith("https://")) {
                    const res = await fetch(randomSrc);
                    // Check if content-type headers exist
                    const contentType = res.headers.get("content-type") || "";
                    
                    if (contentType.includes("image/") || contentType.includes("video/")) {
                        if (filter(randomSrc)) return randomSrc;
                        continue;
                    }
                    
                    // Parse JSON for APIs
                    const data = await res.json();
                    const mediaUrl = data.url || data.file || data.message || data.src || data.image;
                    
                    if (mediaUrl && typeof mediaUrl === "string" && filter(mediaUrl)) {
                        return mediaUrl;
                    }
                } else {
                    // Standard Reddit Fetching
                    const res = await fetch("https://meme-api.com/gimme/" + randomSrc);
                    const data = await res.json();
                    if (data && data.url && filter(data.url)) return data.url;
                }
            } catch (e) { 
                continue; 
            }
        }
        return null;
    }

    // --- COMMANDS BUILDER ---
    const myCommands = [
        ...["sfw", "nsfw"].flatMap(cat => 
            ["femboy", "tomboy"].flatMap(type => [
                {
                    id: `-${cat}-${type}-img`,
                    untranslatedName: cat === "nsfw" ? "nsfw_" + type : type,
                    displayName: cat === "nsfw" ? "nsfw_" + type : type,
                    untranslatedDescription: `Send a ${cat.toUpperCase()} ${type} image`,
                    displayDescription: `Send a ${cat.toUpperCase()} ${type} image`,
                    type: 1,
                    inputType: 0,
                    applicationId: "-1",
                    execute: async (args, ctx) => {
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
                    type: 1,
                    inputType: 0,
                    applicationId: "-1",
                    execute: async (args, ctx) => {
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
            type: 1,
            inputType: 0,
            applicationId: "-1",
            execute: async (args, ctx) => {
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
            type: 1,
            inputType: 0,
            applicationId: "-1",
            options: [{ 
                name: "choice", 
                displayName: "choice", 
                type: 3, 
                required: true, 
                choices: [
                    {name: "tomboy", value: "tomboy"}, 
                    {name: "femboy", value: "femboy"}
                ] 
            }],
            execute: async (args, ctx) => {
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

    // --- SETTINGS UI ---
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

        return React.createElement(ReactNative.ScrollView, { style: { padding: 16 } },
            React.createElement(ReactNative.Text, { style: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 8 } }, 
                "Add External Sources"
            ),
            React.createElement(ReactNative.Text, { style: { color: "#aaa", fontSize: 13, marginBottom: 16 } }, 
                "Enter a subreddit name (e.g., 'femboymemes') OR a direct JSON API URL (e.g., 'https://api.waifu.pics/sfw/waifu') OR a direct image link."
            ),
            
            // Category Toggle Buttons
            React.createElement(ReactNative.View, { style: { flexDirection: "row", marginBottom: 8 } },
                React.createElement(ReactNative.Button, { title: cat === "sfw" ? ">> SFW <<" : "SFW", onPress: () => setCat("sfw") }),
                React.createElement(ReactNative.View, { style: { width: 10 } }),
                React.createElement(ReactNative.Button, { title: cat === "nsfw" ? ">> NSFW <<" : "NSFW", onPress: () => setCat("nsfw") })
            ),
            
            // Type Toggle Buttons
            React.createElement(ReactNative.View, { style: { flexDirection: "row", marginBottom: 16 } },
                React.createElement(ReactNative.Button, { title: type === "femboy" ? ">> Femboy <<" : "Femboy", onPress: () => setType("femboy") }),
                React.createElement(ReactNative.View, { style: { width: 10 } }),
                React.createElement(ReactNative.Button, { title: type === "tomboy" ? ">> Tomboy <<" : "Tomboy", onPress: () => setType("tomboy") })
            ),

            // Input Field
            React.createElement(ReactNative.TextInput, {
                style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#444" },
                placeholder: "Subreddit name or https:// API URL...",
                placeholderTextColor: "#888",
                value: inputVal,
                onChangeText: setInputVal
            }),

            React.createElement(ReactNative.Button, { title: "Add Source", onPress: handleAdd }),

            // List of active custom sources
            React.createElement(ReactNative.Text, { style: { color: "#fff", fontSize: 16, fontWeight: "bold", marginTop: 24, marginBottom: 8 } }, 
                `Custom Sources for ${cat.toUpperCase()} ${type}:`
            ),
            
            currentSources.length === 0 
                ? React.createElement(ReactNative.Text, { style: { color: "#888", fontStyle: "italic" } }, "No custom sources added.")
                : currentSources.map((src, idx) => 
                    React.createElement(ReactNative.View, { key: idx, style: { flexDirection: "row", alignItems: "center", backgroundColor: "#222", padding: 10, borderRadius: 8, marginBottom: 8 } },
                        React.createElement(ReactNative.Text, { style: { color: "#ddd", flex: 1, marginRight: 8 }, numberOfLines: 1 }, src),
                        React.createElement(ReactNative.Button, { title: "Del", color: "#ff4444", onPress: () => handleRemove(idx) })
                    )
                )
        );
    };

    // --- REGISTRATION & UNLOAD ---
    if (Commands && Commands.BUILT_IN_COMMANDS) {
        myCommands.forEach(cmd => Commands.BUILT_IN_COMMANDS.push(cmd));
    }

    exports.onUnload = () => {
        if (Commands && Commands.BUILT_IN_COMMANDS) {
            myCommands.forEach(cmd => {
                const index = Commands.BUILT_IN_COMMANDS.findIndex(c => c.id === cmd.id);
                if (index > -1) Commands.BUILT_IN_COMMANDS.splice(index, 1);
            });
        }
    };

    return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
                        
