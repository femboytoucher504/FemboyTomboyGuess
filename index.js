(function(exports, patcher, metro, storage) {
    "use strict";

    // ── Discord internals ────────────────────────────────────────────────────────
    const Commands = metro.findByProps("BUILT_IN_COMMANDS");
    const React    = metro.findByProps("createElement", "useState");

    // The old code used "Button" which does NOT exist in Discord's bundle.
    // That's why settings crashed. TouchableOpacity always works.
    const { ScrollView, View, Text, TextInput, TouchableOpacity } =
        metro.findByProps("ScrollView", "TextInput", "TouchableOpacity");

    // ── Preset Source Packs ──────────────────────────────────────────────────────
    // Users enable a whole pack with one tap instead of adding subreddits one by one.
    // External APIs (waifu.pics, nekos.life, etc.) are supported alongside Reddit.

    const PRESET_PACKS = [
        {
            id: "reddit-sfw",
            label: "📋 Reddit SFW Pack",
            description: "Curated SFW femboy & tomboy subreddits via meme-api.com",
            sources: {
                sfw: {
                    femboy: ["femboymemes", "MildFemboys", "feminineboys"],
                    tomboy: ["tomboy", "tomboys", "AnimeTomboys"]
                }
            }
        },
        {
            id: "reddit-nsfw",
            label: "🔞 Reddit NSFW Pack",
            description: "NSFW subreddits via meme-api.com",
            sources: {
                nsfw: {
                    femboy: ["femboy", "traditionalfemboys"],
                    tomboy: ["tomboygf"]
                }
            }
        },
        {
            id: "waifupics-sfw",
            label: "🌸 Waifu.pics SFW",
            description: "Anime SFW images from api.waifu.pics (not Reddit)",
            sources: {
                sfw: {
                    femboy: [
                        "https://api.waifu.pics/sfw/waifu",
                        "https://api.waifu.pics/sfw/shinobu"
                    ],
                    tomboy: ["https://api.waifu.pics/sfw/neko"]
                }
            }
        },
        {
            id: "waifupics-nsfw",
            label: "🔞🌸 Waifu.pics NSFW",
            description: "Anime NSFW images from api.waifu.pics (not Reddit)",
            sources: {
                nsfw: {
                    femboy: ["https://api.waifu.pics/nsfw/waifu"],
                    tomboy:  ["https://api.waifu.pics/nsfw/neko"]
                }
            }
        },
        {
            id: "nekoslife-sfw",
            label: "🐱 Nekos.life SFW",
            description: "Anime SFW images from nekos.life (not Reddit)",
            sources: {
                sfw: {
                    femboy: [
                        "https://nekos.life/api/v2/img/neko",
                        "https://nekos.life/api/v2/img/meow"
                    ],
                    tomboy: ["https://nekos.life/api/v2/img/neko"]
                }
            }
        }
    ];

    // ── Storage init ─────────────────────────────────────────────────────────────
    function initStorage() {
        if (!storage.customSources) {
            storage.customSources = {
                sfw:  { femboy: [], tomboy: [] },
                nsfw: { femboy: [], tomboy: [] }
            };
        }
        if (!storage.enabledPacks) {
            storage.enabledPacks = [];
        }
    }
    initStorage();

    // ── Media fetcher ────────────────────────────────────────────────────────────
    const isImage = url => /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);
    const isVideo = url => /\.(mp4|webm)(\?.*)?$/i.test(url);

    async function fetchMedia(type, cat, wantVideo) {
        const filter  = wantVideo ? isVideo : isImage;
        const sources = [];

        for (const packId of (storage.enabledPacks || [])) {
            const pack = PRESET_PACKS.find(p => p.id === packId);
            sources.push(...(pack && pack.sources && pack.sources[cat] && pack.sources[cat][type] ? pack.sources[cat][type] : []));
        }
        sources.push(...(storage.customSources && storage.customSources[cat] && storage.customSources[cat][type] ? storage.customSources[cat][type] : []));

        if (sources.length === 0) return null;

        for (let i = 0; i < 10; i++) {
            const src = sources[Math.floor(Math.random() * sources.length)];
            try {
                if (src.startsWith("http://") || src.startsWith("https://")) {
                    const res = await fetch(src, { headers: { "User-Agent": "RevengePlugin/1.0" } });
                    if (!res.ok) continue;
                    const ct = res.headers.get("content-type") || "";
                    if (ct.includes("image/") || ct.includes("video/")) {
                        if (filter(src)) return src;
                        continue;
                    }
                    // JSON API (waifu.pics, nekos.life, etc.)
                    const data = await res.json();
                    const url  = data.url || data.file || data.message || data.src || data.image || data.link || "";
                    if (url && filter(url)) return url;
                } else {
                    // Reddit via meme-api.com
                    const res  = await fetch("https://meme-api.com/gimme/" + src, { headers: { "User-Agent": "RevengePlugin/1.0" } });
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (data && data.url && filter(data.url) && !data.nsfw) return data.url;
                }
            } catch(e) { continue; }
        }
        return null;
    }

    // ── Settings UI ──────────────────────────────────────────────────────────────
    exports.settings = function SettingsView() {
        const [tab,   setTab]   = React.useState("packs");
        const [cat,   setCat]   = React.useState("sfw");
        const [type,  setType]  = React.useState("femboy");
        const [input, setInput] = React.useState("");
        const [tick,  setTick]  = React.useState(0);

        // Forces the component to re-draw after we mutate storage
        const refresh = () => setTick(function(t) { return t + 1; });

        const enabledPacks = storage.enabledPacks || [];
        const custom       = (storage.customSources && storage.customSources[cat] && storage.customSources[cat][type]) || [];

        const togglePack = function(id) {
            const idx = storage.enabledPacks.indexOf(id);
            if (idx > -1) storage.enabledPacks.splice(idx, 1);
            else storage.enabledPacks.push(id);
            refresh();
        };

        const addCustom = function() {
            const v = input.trim();
            if (!v || custom.includes(v)) return;
            storage.customSources[cat][type].push(v);
            setInput("");
            refresh();
        };

        const removeCustom = function(idx) {
            storage.customSources[cat][type].splice(idx, 1);
            refresh();
        };

        const e = React.createElement;

        // Reusable pill-style toggle button
        function Pill(label, active, onPress, marginRight) {
            return e(TouchableOpacity, {
                onPress: onPress,
                style: {
                    flex: 1, padding: 10,
                    backgroundColor: active ? "#5865F2" : "#2B2D31",
                    borderRadius: 8, alignItems: "center",
                    marginRight: marginRight || 0
                }
            }, e(Text, { style: { color: "#fff", fontWeight: "bold" } }, label));
        }

        return e(ScrollView,
            { style: { flex: 1 }, contentContainerStyle: { padding: 16 } },

            // Tab bar
            e(View, { style: { flexDirection: "row", marginBottom: 16 } },
                Pill("📦 Source Packs",  tab === "packs",  function() { setTab("packs");  }, 8),
                Pill("✏️ Custom Sources", tab === "custom", function() { setTab("custom"); })
            ),

            // ── PACKS TAB ──────────────────────────────────────────────────────
            tab === "packs" && e(View, null,
                e(Text, { style: { color: "#aaa", marginBottom: 12, fontSize: 13 } },
                    "Tap a pack to enable or disable all its sources at once. No adding one by one."
                ),
                PRESET_PACKS.map(function(pack) {
                    var on = enabledPacks.includes(pack.id);
                    return e(TouchableOpacity, {
                        key: pack.id,
                        onPress: function() { togglePack(pack.id); },
                        style: {
                            backgroundColor: on ? "#1a3a6e" : "#2B2D31",
                            borderRadius: 10, padding: 14, marginBottom: 10,
                            borderWidth: 1, borderColor: on ? "#5865F2" : "#444"
                        }
                    },
                        e(View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
                            e(Text, { style: { color: "#fff", fontWeight: "bold", fontSize: 15, flex: 1 } }, pack.label),
                            e(Text, { style: { fontSize: 18 } }, on ? "✅" : "⬜")
                        ),
                        e(Text, { style: { color: "#aaa", fontSize: 12, marginTop: 4 } }, pack.description)
                    );
                })
            ),

            // ── CUSTOM TAB ─────────────────────────────────────────────────────
            tab === "custom" && e(View, null,
                e(View, { style: { flexDirection: "row", marginBottom: 8 } },
                    Pill("SFW",  cat === "sfw",  function() { setCat("sfw");  }, 8),
                    Pill("NSFW", cat === "nsfw", function() { setCat("nsfw"); })
                ),
                e(View, { style: { flexDirection: "row", marginBottom: 16 } },
                    Pill("Femboy", type === "femboy", function() { setType("femboy"); }, 8),
                    Pill("Tomboy", type === "tomboy", function() { setType("tomboy"); })
                ),
                e(Text, { style: { color: "#aaa", fontSize: 12, marginBottom: 8 } },
                    "Enter a subreddit name (e.g. femboymemes) OR a full API URL (e.g. https://api.waifu.pics/sfw/waifu)"
                ),
                e(TextInput, {
                    style: {
                        backgroundColor: "#1E1F22", color: "#fff",
                        padding: 12, borderRadius: 8,
                        borderWidth: 1, borderColor: "#444", marginBottom: 8
                    },
                    placeholder: "subreddit or https://...",
                    placeholderTextColor: "#555",
                    value: input,
                    onChangeText: setInput,
                    autoCapitalize: "none",
                    autoCorrect: false
                }),
                e(TouchableOpacity, {
                    onPress: addCustom,
                    style: {
                        backgroundColor: "#5865F2", padding: 12,
                        borderRadius: 8, alignItems: "center", marginBottom: 24
                    }
                }, e(Text, { style: { color: "#fff", fontWeight: "bold" } }, "+ Add Source")),

                e(Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 8 } },
                    "Custom Sources — " + cat.toUpperCase() + " / " + type + ":"
                ),

                custom.length === 0
                    ? e(Text, { style: { color: "#555", fontStyle: "italic" } }, "None added yet.")
                    : custom.map(function(src, idx) {
                        return e(View, {
                            key: idx,
                            style: {
                                flexDirection: "row", alignItems: "center",
                                backgroundColor: "#2B2D31", padding: 10,
                                borderRadius: 8, marginBottom: 8
                            }
                        },
                            e(Text, { style: { color: "#ddd", flex: 1, marginRight: 8 }, numberOfLines: 1 }, src),
                            e(TouchableOpacity, { onPress: function() { removeCustom(idx); } },
                                e(Text, { style: { color: "#ff5555", fontWeight: "bold", fontSize: 16 } }, "✕")
                            )
                        );
                    })
            )
        );
    };

    // ── Commands ─────────────────────────────────────────────────────────────────
    const myCommands = [];
    const combos = [["femboy","sfw"],["femboy","nsfw"],["tomboy","sfw"],["tomboy","nsfw"]];
    let activeGuesses = {};

    combos.forEach(function(pair) {
        const type = pair[0];
        const cat  = pair[1];
        const name = cat === "nsfw" ? "nsfw_" + type : type;

        myCommands.push({
            id: "-cmd-" + cat + "-" + type + "-img",
            untranslatedName: name, displayName: name,
            untranslatedDescription: "Send a " + cat.toUpperCase() + " " + type + " image",
            displayDescription:      "Send a " + cat.toUpperCase() + " " + type + " image",
            type: 1, inputType: 0, applicationId: "-1",
            execute: (function(t, c) {
                return async function() {
                    const url = await fetchMedia(t, c, false);
                    if (!url) return { content: "❌ No sources enabled for " + c + " " + t + ". Open plugin settings → Source Packs!" };
                    return { content: url };
                };
            })(type, cat)
        });

        myCommands.push({
            id: "-cmd-" + cat + "-" + type + "-vid",
            untranslatedName: name + "_video", displayName: name + "_video",
            untranslatedDescription: "Send a " + cat.toUpperCase() + " " + type + " video",
            displayDescription:      "Send a " + cat.toUpperCase() + " " + type + " video",
            type: 1, inputType: 0, applicationId: "-1",
            execute: (function(t, c) {
                return async function() {
                    const url = await fetchMedia(t, c, true);
                    if (!url) return { content: "❌ No video sources for " + c + " " + t + ". Add custom sources in settings!" };
                    return { content: url };
                };
            })(type, cat)
        });
    });

    myCommands.push({
        id: "-cmd-guess",
        untranslatedName: "guess", displayName: "guess",
        untranslatedDescription: "Femboy or Tomboy guessing game",
        displayDescription: "Femboy or Tomboy guessing game",
        type: 1, inputType: 0, applicationId: "-1",
        execute: async function(args, ctx) {
            const type = Math.random() > 0.5 ? "femboy" : "tomboy";
            const url  = await fetchMedia(type, "sfw", false);
            if (!url) return { content: "❌ No SFW sources enabled. Open plugin settings → Source Packs!" };
            activeGuesses[ctx.channel.id] = type;
            return { content: "📸 **Femboy or Tomboy?** Make your guess!\n\n||Answer: **" + type + "**||\n" + url };
        }
    });

    if (Commands && Commands.BUILT_IN_COMMANDS) {
        myCommands.forEach(function(cmd) { Commands.BUILT_IN_COMMANDS.push(cmd); });
    }

    // ── Unload ───────────────────────────────────────────────────────────────────
    exports.onUnload = function() {
        if (Commands && Commands.BUILT_IN_COMMANDS) {
            myCommands.forEach(function(cmd) {
                const i = Commands.BUILT_IN_COMMANDS.findIndex(function(c) { return c.id === cmd.id; });
                if (i > -1) Commands.BUILT_IN_COMMANDS.splice(i, 1);
            });
        }
        activeGuesses = {};
    };

    return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
                         
