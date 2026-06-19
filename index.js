(function(exports, patcher, metro, storage) {
    "use strict";

    // ── Discord internals ────────────────────────────────────────────────────────
    const Commands = metro.findByProps("BUILT_IN_COMMANDS");

    // More robust way to find the message sender in modern Discord
    const MessageActions = metro.findByProps("sendMessage", "receiveMessage") 
        || metro.findByProps("sendMessage", "editMessage")
        || metro.findByProps("sendMessage", "deleteMessage")
        || metro.findByProps("sendMessage");

    const React = metro.findByProps("createElement", "useState");

    const { ScrollView, View, Text, TextInput, TouchableOpacity } =
        metro.findByProps("ScrollView", "TextInput", "TouchableOpacity") || {};

    // ── Send helper ───────────────────────────────────────────────────────────────
    function send(channelId, text) {
        if (!MessageActions || typeof MessageActions.sendMessage !== "function") return false;
        try {
            MessageActions.sendMessage(channelId, { content: String(text) });
            return true;
        } catch(e) {
            return false;
        }
    }

    // ── HARDCODED default sources ─────────────────────────────────────────────────
    const DEFAULT_SOURCES = {
        sfw: {
            femboy: [
                "https://api.waifu.pics/sfw/waifu",
                "https://api.waifu.pics/sfw/shinobu"
            ],
            tomboy: [
                "https://api.waifu.pics/sfw/neko"
            ]
        },
        nsfw: {
            femboy: [
                "https://api.waifu.pics/nsfw/waifu"
            ],
            tomboy: [
                "https://api.waifu.pics/nsfw/neko"
            ]
        }
    };

    // ── Preset Source Packs (for settings UI) ─────────────────────────────────────
    const PRESET_PACKS = [
        {
            id: "reddit-sfw",
            label: "📋 Reddit SFW Pack",
            description: "Curated SFW subreddits via meme-api.com",
            sources: { sfw: { femboy: ["femboymemes", "MildFemboys", "feminineboys"], tomboy: ["tomboy", "tomboys", "AnimeTomboys"] } }
        },
        {
            id: "reddit-nsfw",
            label: "🔞 Reddit NSFW Pack",
            description: "NSFW subreddits via meme-api.com",
            sources: { nsfw: { femboy: ["femboy", "traditionalfemboys"], tomboy: ["tomboygf"] } }
        },
        {
            id: "waifupics-sfw",
            label: "🌸 Waifu.pics SFW",
            description: "Anime SFW from api.waifu.pics",
            sources: { sfw: { femboy: ["https://api.waifu.pics/sfw/waifu", "https://api.waifu.pics/sfw/shinobu"], tomboy: ["https://api.waifu.pics/sfw/neko"] } }
        },
        {
            id: "waifupics-nsfw",
            label: "🔞🌸 Waifu.pics NSFW",
            description: "Anime NSFW from api.waifu.pics",
            sources: { nsfw: { femboy: ["https://api.waifu.pics/nsfw/waifu"], tomboy: ["https://api.waifu.pics/nsfw/neko"] } }
        },
        {
            id: "nekoslife-sfw",
            label: "🐱 Nekos.life SFW",
            description: "Anime SFW from nekos.life",
            sources: { sfw: { femboy: ["https://nekos.life/api/v2/img/neko", "https://nekos.life/api/v2/img/meow"], tomboy: ["https://nekos.life/api/v2/img/neko"] } }
        }
    ];

    // ── Storage init ──────────────────────────────────────────────────────────────
    function initStorage() {
        if (!storage.customSources) storage.customSources = { sfw: { femboy: [], tomboy: [] }, nsfw: { femboy: [], tomboy: [] } };
        if (!storage.enabledPacks) storage.enabledPacks = [];
    }
    initStorage();

    // ── Media fetcher ─────────────────────────────────────────────────────────────
    const isImage = function(u) { return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(u); };
    const isVideo = function(u) { return /\.(mp4|webm)(\?.*)?$/i.test(u); };

    async function fetchMedia(type, cat, wantVideo) {
        var filter = wantVideo ? isVideo : isImage;
        var sources = [];

        var def = DEFAULT_SOURCES[cat] && DEFAULT_SOURCES[cat][type];
        if (def) for (var d = 0; d < def.length; d++) sources.push(def[d]);

        var packs = storage.enabledPacks || [];
        for (var pi = 0; pi < packs.length; pi++) {
            for (var pp = 0; pp < PRESET_PACKS.length; pp++) {
                if (PRESET_PACKS[pp].id === packs[pi]) {
                    var ps = PRESET_PACKS[pp].sources && PRESET_PACKS[pp].sources[cat] && PRESET_PACKS[pp].sources[cat][type];
                    if (ps) for (var s = 0; s < ps.length; s++) sources.push(ps[s]);
                }
            }
        }

        var custom = storage.customSources && storage.customSources[cat] && storage.customSources[cat][type];
        if (custom) for (var cs = 0; cs < custom.length; cs++) sources.push(custom[cs]);

        if (sources.length === 0) return "❌ No sources found in settings.";

        for (var i = 0; i < 15; i++) {
            var src = sources[Math.floor(Math.random() * sources.length)];
            try {
                if (src.indexOf("http") === 0) {
                    var res = await fetch(src); // Removed User-Agent to prevent Cloudflare blocks
                    if (!res.ok) continue;
                    var ct = res.headers.get("content-type") || "";
                    if (ct.indexOf("image/") > -1 || ct.indexOf("video/") > -1) {
                        if (filter(src)) return src;
                        continue;
                    }
                    var data = await res.json();
                    var url = data.url || data.file || data.message || data.src || data.image || data.link || "";
                    if (url && filter(url)) return url;
                } else {
                    var r2 = await fetch("https://meme-api.com/gimme/" + src);
                    if (!r2.ok) continue;
                    var d2 = await r2.json();
                    if (d2 && d2.url && filter(d2.url)) {
                        if (cat === "sfw" && d2.nsfw) continue; // Ensure SFW commands don't pull NSFW reddit posts
                        return d2.url;
                    }
                }
            } catch(e) { continue; }
        }
        return "❌ Failed to find a matching " + (wantVideo ? "video" : "image") + " after 15 tries. Try enabling more packs in settings!";
    }

    // ── Settings UI ───────────────────────────────────────────────────────────────
    exports.settings = function SettingsView() {
        var tabS   = React.useState("packs");   var tab = tabS[0];   var setTab = tabS[1];
        var catS   = React.useState("sfw");     var cat = catS[0];   var setCat = catS[1];
        var typeS  = React.useState("femboy");  var type = typeS[0]; var setType = typeS[1];
        var inpS   = React.useState("");        var input = inpS[0]; var setInput = inpS[1];
        var tickS  = React.useState(0);         var setTick = tickS[1];

        var refresh = function() { setTick(function(t) { return t + 1; }); };
        var enabledPacks = storage.enabledPacks || [];
        var custom = (storage.customSources && storage.customSources[cat] && storage.customSources[cat][type]) || [];

        var togglePack = function(id) {
            var idx = storage.enabledPacks.indexOf(id);
            if (idx > -1) storage.enabledPacks.splice(idx, 1);
            else storage.enabledPacks.push(id);
            refresh();
        };
        var addCustom = function() {
            var v = input.trim();
            if (!v || custom.indexOf(v) > -1) return;
            storage.customSources[cat][type].push(v);
            setInput(""); refresh();
        };
        var removeCustom = function(idx) {
            storage.customSources[cat][type].splice(idx, 1);
            refresh();
        };

        var e = React.createElement;
        var Pill = function(label, active, onPress, mr) {
            return e(TouchableOpacity, { onPress: onPress, style: { flex: 1, padding: 10, backgroundColor: active ? "#5865F2" : "#2B2D31", borderRadius: 8, alignItems: "center", marginRight: mr || 0 } },
                e(Text, { style: { color: "#fff", fontWeight: "bold" } }, label));
        };

        return e(ScrollView, { style: { flex: 1 }, contentContainerStyle: { padding: 16 } },
            e(View, { style: { flexDirection: "row", marginBottom: 16 } },
                Pill("📦 Source Packs", tab === "packs", function() { setTab("packs"); }, 8),
                Pill("✏️ Custom Sources", tab === "custom", function() { setTab("custom"); })
            ),
            tab === "packs" && e(View, null,
                e(Text, { style: { color: "#aaa", marginBottom: 12, fontSize: 13 } }, "Tap a pack to enable or disable. Defaults (waifu.pics) always active."),
                PRESET_PACKS.map(function(pack) {
                    var on = enabledPacks.indexOf(pack.id) > -1;
                    return e(TouchableOpacity, { key: pack.id, onPress: function() { togglePack(pack.id); }, style: { backgroundColor: on ? "#1a3a6e" : "#2B2D31", borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: on ? "#5865F2" : "#444" } },
                        e(View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
                            e(Text, { style: { color: "#fff", fontWeight: "bold", fontSize: 15, flex: 1 } }, pack.label),
                            e(Text, { style: { fontSize: 18 } }, on ? "✅" : "⬜")
                        ),
                        e(Text, { style: { color: "#aaa", fontSize: 12, marginTop: 4 } }, pack.description)
                    );
                })
            ),
            tab === "custom" && e(View, null,
                e(View, { style: { flexDirection: "row", marginBottom: 8 } },
                    Pill("SFW", cat === "sfw", function() { setCat("sfw"); }, 8),
                    Pill("NSFW", cat === "nsfw", function() { setCat("nsfw"); })
                ),
                e(View, { style: { flexDirection: "row", marginBottom: 16 } },
                    Pill("Femboy", type === "femboy", function() { setType("femboy"); }, 8),
                    Pill("Tomboy", type === "tomboy", function() { setType("tomboy"); })
                ),
                e(TextInput, {
                    style: { backgroundColor: "#1E1F22", color: "#fff", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#444", marginBottom: 8 },
                    placeholder: "subreddit or https://...", placeholderTextColor: "#555",
                    value: input, onChangeText: setInput, autoCapitalize: "none", autoCorrect: false
                }),
                e(TouchableOpacity, { onPress: addCustom, style: { backgroundColor: "#5865F2", padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 24 } },
                    e(Text, { style: { color: "#fff", fontWeight: "bold" } }, "+ Add Source")
                ),
                e(Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 8 } }, "Custom — " + cat.toUpperCase() + " / " + type + ":"),
                custom.length === 0
                    ? e(Text, { style: { color: "#555", fontStyle: "italic" } }, "None added yet.")
                    : custom.map(function(src, idx) {
                        return e(View, { key: idx, style: { flexDirection: "row", alignItems: "center", backgroundColor: "#2B2D31", padding: 10, borderRadius: 8, marginBottom: 8 } },
                            e(Text, { style: { color: "#ddd", flex: 1, marginRight: 8 }, numberOfLines: 1 }, src),
                            e(TouchableOpacity, { onPress: function() { removeCustom(idx); } },
                                e(Text, { style: { color: "#ff5555", fontWeight: "bold", fontSize: 16 } }, "✕")
                            )
                        );
                    })
            )
        );
    };

    // ── Commands ──────────────────────────────────────────────────────────────────
    var myCommands = [];

    // /ftest (Use this to test if the fallback is working!)
    myCommands.push({
        id: "-cmd-test",
        untranslatedName: "ftest", displayName: "ftest",
        untranslatedDescription: "Debug: checks if the plugin can send messages",
        displayDescription: "Debug: checks if the plugin can send messages",
        type: 1, inputType: 0, applicationId: "-1",
        execute: async function(args, ctx) {
            var channelId = ctx?.channel?.id || ctx?.channelId;
            var text = "✅ Plugin is working! MessageActions found: " + !!MessageActions;
            
            if (channelId) {
                var sent = send(channelId, text);
                if (sent) return {};
            }
            // The Fallback: Returns the text directly to you if normal sending fails
            return { content: "⚠️ Could not send publicly. Showing locally:\n\n" + text };
        }
    });

    var combos = [["femboy","sfw"],["femboy","nsfw"],["tomboy","sfw"],["tomboy","nsfw"]];
    combos.forEach(function(pair) {
        var type = pair[0]; var cat = pair[1];
        var name = cat === "nsfw" ? "nsfw_" + type : type;

        myCommands.push({
            id: "-cmd-" + cat + "-" + type + "-img",
            untranslatedName: name, displayName: name,
            untranslatedDescription: "Send a " + cat.toUpperCase() + " " + type + " image",
            displayDescription: "Send a " + cat.toUpperCase() + " " + type + " image",
            type: 1, inputType: 0, applicationId: "-1",
            execute: (function(t, c) {
                return async function(args, ctx) {
                    var channelId = ctx?.channel?.id || ctx?.channelId;
                    var result = await fetchMedia(t, c, false);
                    
                    if (channelId) {
                        var sent = send(channelId, result);
                        if (sent) return {};
                    }
                    return { content: result }; // Fallback
                };
            })(type, cat)
        });

        myCommands.push({
            id: "-cmd-" + cat + "-" + type + "-vid",
            untranslatedName: name + "_video", displayName: name + "_video",
            untranslatedDescription: "Send a " + cat.toUpperCase() + " " + type + " video",
            displayDescription: "Send a " + cat.toUpperCase() + " " + type + " video",
            type: 1, inputType: 0, applicationId: "-1",
            execute: (function(t, c) {
                return async function(args, ctx) {
                    var channelId = ctx?.channel?.id || ctx?.channelId;
                    var result = await fetchMedia(t, c, true);
                    
                    if (channelId) {
                        var sent = send(channelId, result);
                        if (sent) return {};
                    }
                    return { content: result }; // Fallback
                };
            })(type, cat)
        });
    });

    // ── THE GUESSING GAME COMMAND ──
    myCommands.push({
        id: "-cmd-guess",
        untranslatedName: "guess", displayName: "guess",
        untranslatedDescription: "Femboy or Tomboy guessing game",
        displayDescription: "Femboy or Tomboy guessing game",
        type: 1, inputType: 0, applicationId: "-1",
        execute: async function(args, ctx) {
            var channelId = ctx?.channel?.id || ctx?.channelId;
            var type = Math.random() > 0.5 ? "femboy" : "tomboy";
            var result = await fetchMedia(type, "sfw", false);
            var text;
            
            if (result.indexOf("http") === 0) {
                text = "📸 **Femboy or Tomboy?** Tap the spoiler when ready!\n\n||Answer: **" + type + "**||\n" + result;
            } else {
                text = result;
            }

            if (channelId) {
                var sent = send(channelId, text);
                if (sent) return {};
            }
            return { content: text }; // Fallback
        }
    });

    if (Commands && Commands.BUILT_IN_COMMANDS) {
        myCommands.forEach(function(cmd) { Commands.BUILT_IN_COMMANDS.push(cmd); });
    }

    exports.onUnload = function() {
        if (Commands && Commands.BUILT_IN_COMMANDS) {
            myCommands.forEach(function(cmd) {
                var i = Commands.BUILT_IN_COMMANDS.findIndex(function(c) { return c.id === cmd.id; });
                if (i > -1) Commands.BUILT_IN_COMMANDS.splice(i, 1);
            });
        }
    };

    return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
        
