const { findByProps } = vendetta.metro;
const { registerCommand } = vendetta.commands;
const { storage } = vendetta.plugin;

// Safely grab React and React Native components
const React = findByProps("createElement", "useState");
const ReactNative = findByProps("ScrollView", "TextInput", "Button", "Text", "View");
const MessageActions = findByProps("sendMessage");

// 1. INITIALIZE STORAGE
if (!storage.sources) {
    storage.sources = {
        sfw: { femboy: [], tomboy: [] },
        nsfw: { femboy: [], tomboy: [] }
    };
}

// 2. FETCH MEDIA LOGIC
function fetchMedia(type, cat, mediaType) {
    const defaultSources = {
        sfw: { femboy: ["femboymemes", "femboysfw"], tomboy: ["tomboy", "AnimeTomboys"] },
        nsfw: { femboy: ["femboy", "traditionalfemboys"], tomboy: ["tomboygf"] }
    };

    const baseSubs = defaultSources[cat][type] || [];
    const customSources = storage.sources[cat][type] || [];
    const allSources = baseSubs.concat(customSources);

    if (allSources.length === 0) return Promise.resolve(null);
    
    // Pick a random source
    const randomSrc = allSources[Math.floor(Math.random() * allSources.length)];

    const filter = mediaType === "video" 
        ? function(url) { return /\.(mp4|webm)$/i.test(url); } 
        : function(url) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(url); };

    // If it's a custom Web URL / API
    if (randomSrc.indexOf("http") === 0) {
        return fetch(randomSrc).then(function(res) {
            const contentType = res.headers.get("content-type") || "";
            if (contentType.indexOf("image/") !== -1 || contentType.indexOf("video/") !== -1) return randomSrc;
            
            return res.json().then(function(data) {
                const url = data.url || data.file || data.message || data.src || data.image;
                return (url && filter(url)) ? url : null;
            });
        }).catch(function() { return null; });
    } 
    // If it's a Subreddit name
    else {
        return fetch("https://meme-api.com/gimme/" + randomSrc).then(function(res) {
            return res.json().then(function(data) {
                return (data && data.url && filter(data.url)) ? data.url : null;
            });
        }).catch(function() { return null; });
    }
}

// 3. SETTINGS UI VIEW
function SettingsView() {
    const [cat, setCat] = React.useState("sfw");
    const [type, setType] = React.useState("femboy");
    const [input, setInput] = React.useState("");
    const [refresh, setRefresh] = React.useState(0);

    const currentSources = storage.sources[cat][type];

    const handleAdd = function() {
        const val = input.trim();
        if (!val) return;
        if (currentSources.indexOf(val) === -1) {
            currentSources.push(val);
        }
        setInput("");
        setRefresh(refresh + 1);
    };

    const handleRemove = function(index) {
        currentSources.splice(index, 1);
        setRefresh(refresh + 1);
    };

    return React.createElement(ReactNative.ScrollView, { style: { padding: 16 } },
        React.createElement(ReactNative.Text, { style: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 12 } }, 
            "Manage Sources"
        ),
        React.createElement(ReactNative.Text, { style: { color: "#aaa", marginBottom: 12 } }, 
            "Add a subreddit name (e.g. 'femboymemes') OR a full web URL/API link (e.g. 'https://api.waifu.pics/sfw/waifu')."
        ),
        React.createElement(ReactNative.View, { style: { flexDirection: "row", marginBottom: 8 } },
            React.createElement(ReactNative.Button, { title: cat === "sfw" ? "[ SFW ]" : "SFW", onPress: function() { setCat("sfw"); } }),
            React.createElement(ReactNative.View, { style: { width: 10 } }),
            React.createElement(ReactNative.Button, { title: cat === "nsfw" ? "[ NSFW ]" : "NSFW", onPress: function() { setCat("nsfw"); } })
        ),
        React.createElement(ReactNative.View, { style: { flexDirection: "row", marginBottom: 16 } },
            React.createElement(ReactNative.Button, { title: type === "femboy" ? "[ Femboy ]" : "Femboy", onPress: function() { setType("femboy"); } }),
            React.createElement(ReactNative.View, { style: { width: 10 } }),
            React.createElement(ReactNative.Button, { title: type === "tomboy" ? "[ Tomboy ]" : "Tomboy", onPress: function() { setType("tomboy"); } })
        ),
        React.createElement(ReactNative.TextInput, {
            style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 6, marginBottom: 8 },
            placeholder: "Enter Subreddit or https:// link...",
            placeholderTextColor: "#666",
            value: input,
            onChangeText: setInput
        }),
        React.createElement(ReactNative.Button, { title: "Add Source", onPress: handleAdd }),
        React.createElement(ReactNative.Text, { style: { color: "#fff", marginTop: 24, marginBottom: 8, fontWeight: "bold" } }, 
            "Custom Sources (" + cat.toUpperCase() + " " + type + "):"
        ),
        currentSources.length === 0 
            ? React.createElement(ReactNative.Text, { style: { color: "#888", fontStyle: "italic" } }, "No custom sources added.") 
            : null,
        currentSources.map(function(src, i) {
            return React.createElement(ReactNative.View, { key: i, style: { flexDirection: "row", alignItems: "center", backgroundColor: "#111", padding: 8, borderRadius: 6, marginBottom: 6 } },
                React.createElement(ReactNative.Text, { style: { color: "#fff", flex: 1, marginRight: 8 } }, src),
                React.createElement(ReactNative.Button, { title: "Del", color: "#ff4444", onPress: function() { handleRemove(i); } })
            );
        })
    );
}

// 4. MODULE EXPORT & COMMAND REGISTRATION
// This is the format Revenge actually expects to prevent crashes.
let unregisterCommands = [];

module.exports = {
    settings: SettingsView,
    onLoad: function() {
        ["sfw", "nsfw"].forEach(function(cat) {
            ["femboy", "tomboy"].forEach(function(type) {
                
                // Image Command
                unregisterCommands.push(registerCommand({
                    name: (cat === "nsfw" ? "nsfw_" : "") + type,
                    displayName: (cat === "nsfw" ? "nsfw_" : "") + type,
                    description: "Sends a " + cat.toUpperCase() + " " + type + " image.",
                    displayDescription: "Sends a " + cat.toUpperCase() + " " + type + " image.",
                    applicationId: "-1",
                    inputType: 1,
                    type: 1,
                    execute: function(args, ctx) {
                        fetchMedia(type, cat, "image").then(function(url) {
                            if (url && MessageActions) {
                                MessageActions.sendMessage(ctx.channel.id, { content: url });
                            }
                        });
                    }
                }));

                // Video Command
                unregisterCommands.push(registerCommand({
                    name: (cat === "nsfw" ? "nsfw_" : "") + type + "_video",
                    displayName: (cat === "nsfw" ? "nsfw_" : "") + type + "_video",
                    description: "Sends a " + cat.toUpperCase() + " " + type + " video.",
                    displayDescription: "Sends a " + cat.toUpperCase() + " " + type + " video.",
                    applicationId: "-1",
                    inputType: 1,
                    type: 1,
                    execute: function(args, ctx) {
                        fetchMedia(type, cat, "video").then(function(url) {
                            if (url && MessageActions) {
                                MessageActions.sendMessage(ctx.channel.id, { content: url });
                            }
                        });
                    }
                }));
            });
        });
    },
    onUnload: function() {
        unregisterCommands.forEach(function(unregister) { 
            unregister(); 
        });
        unregisterCommands = [];
    }
};
                                                     
