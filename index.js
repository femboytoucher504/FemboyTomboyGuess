(function(exports, patcher, metro, storage) {
    "use strict";

    // Use the same registerCommand API that GlobalSearch uses
    // This handles sending the message properly — no MessageActions needed
    var registerCommand = vendetta.commands.registerCommand;

    var React = metro.findByProps("createElement", "useState");
    var RN    = metro.findByProps("ScrollView", "TextInput", "TouchableOpacity");

    // ── Hardcoded defaults (always work, no setup needed) ────────────────────────
    var DEFAULT_SOURCES = {
        sfw: {
            femboy: ["https://api.waifu.pics/sfw/waifu", "https://api.waifu.pics/sfw/shinobu"],
            tomboy: ["https://api.waifu.pics/sfw/neko"]
        },
        nsfw: {
            femboy: ["https://api.waifu.pics/nsfw/waifu"],
            tomboy:  ["https://api.waifu.pics/nsfw/neko"]
        }
    };

    // ── Preset packs (for settings — extras on top of defaults) ──────────────────
    var PRESET_PACKS = [
        {
            id: "reddit-sfw",
            label: "📋 Reddit SFW",
            description: "Femboy & tomboy subreddits via meme-api.com",
            sources: { sfw: { femboy: ["femboymemes","MildFemboys","feminineboys"], tomboy: ["tomboy","tomboys","AnimeTomboys"] } }
        },
        {
            id: "reddit-nsfw",
            label: "🔞 Reddit NSFW",
            description: "NSFW subreddits via meme-api.com",
            sources: { nsfw: { femboy: ["femboy","traditionalfemboys"], tomboy: ["tomboygf"] } }
        },
        {
            id: "waifupics-sfw",
            label: "🌸 Waifu.pics SFW",
            description: "Extra anime SFW from api.waifu.pics",
            sources: { sfw: { femboy: ["https://api.waifu.pics/sfw/waifu","https://api.waifu.pics/sfw/shinobu"], tomboy: ["https://api.waifu.pics/sfw/neko"] } }
        },
        {
            id: "waifupics-nsfw",
            label: "🔞🌸 Waifu.pics NSFW",
            description: "Anime NSFW from api.waifu.pics",
            sources: { nsfw: { femboy: ["https://api.waifu.pics/nsfw/waifu"], tomboy: ["https://api.waifu.pics/nsfw/neko"] } }
        },
        {
            id: "nekoslife",
            label: "🐱 Nekos.life SFW",
            description: "Anime SFW from nekos.life",
            sources: { sfw: { femboy: ["https://nekos.life/api/v2/img/neko","https://nekos.life/api/v2/img/meow"], tomboy: ["https://nekos.life/api/v2/img/neko"] } }
        }
    ];

    // ── Storage ───────────────────────────────────────────────────────────────────
    function initStorage() {
        if (!storage.customSources) storage.customSources = { sfw: { femboy: [], tomboy: [] }, nsfw: { femboy: [], tomboy: [] } };
        if (!storage.enabledPacks)  storage.enabledPacks  = [];
    }
    initStorage();

    // ── Fetch ─────────────────────────────────────────────────────────────────────
    var isImage = function(u) { return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(u); };
    var isVideo = function(u) { return /\.(mp4|webm)(\?.*)?$/i.test(u); };

    async function fetchMedia(type, cat, wantVideo) {
        var filter  = wantVideo ? isVideo : isImage;
        var sources = [];

        // Always start with hardcoded defaults
        var def = DEFAULT_SOURCES[cat] && DEFAULT_SOURCES[cat][type];
        if (def) for (var d = 0; d < def.length; d++) sources.push(def[d]);

        // Add enabled pack sources
        for (var pi = 0; pi < (storage.enabledPacks || []).length; pi++) {
            for (var pp = 0; pp < PRESET_PACKS.length; pp++) {
                if (PRESET_PACKS[pp].id === storage.enabledPacks[pi]) {
                    var s = PRESET_PACKS[pp].sources && PRESET_PACKS[pp].sources[cat] && PRESET_PACKS[pp].sources[cat][type];
                    if (s) for (var si = 0; si < s.length; si++) sources.push(s[si]);
                }
            }
        }

        // Add custom sources
        var custom = storage.customSources && storage.customSources[cat] && storage.customSources[cat][type];
        if (custom) for (var ci = 0; ci < custom.length; ci++) sources.push(custom[ci]);

        for (var i = 0; i < 10; i++) {
            var src = sources[Math.floor(Math.random() * sources.length)];
            try {
                if (src.indexOf("http") === 0) {
                    var res = await fetch(src, { headers: { "User-Agent": "RevengePlugin/1.0" } });
                    if (!res.ok) continue;
                    var ct = res.headers.get("content-type") || "";
                    if (ct.indexOf("image/") > -1 || ct.indexOf("video/") > -1) {
                        if (filter(src)) return src; else continue;
                    }
                    var data = await res.json();
                    var url  = data.url || data.file || data.message || data.src || data.image || "";
                    if (url && filter(url)) return url;
                } else {
                    var r2  = await fetch("https://meme-api.com/gimme/" + src, { headers: { "User-Agent": "RevengePlugin/1.0" } });
                    if (!r2.ok) continue;
                    var d2  = await r2.json();
                    if (d2 && d2.url && filter(d2.url) && !d2.nsfw) return d2.url;
                }
            } catch(e) { continue; }
        }
        return null;
    }

    // ── Settings UI ───────────────────────────────────────────────────────────────
    exports.settings = function SettingsView() {
        var tabS  = React.useState("packs");  var tab  = tabS[0];  var setTab  = tabS[1];
        var catS  = React.useState("sfw");    var cat  = catS[0];  var setCat  = catS[1];
        var typS  = React.useState("femboy"); var typ  = typS[0];  var setTyp  = typS[1];
        var inpS  = React.useState("");       var inp  = inpS[0];  var setInp  = inpS[1];
        var tikS  = React.useState(0);        var setTik = tikS[1];
        var refresh = function() { setTik(function(t) { return t+1; }); };

        var epacks = storage.enabledPacks || [];
        var custom = (storage.customSources && storage.customSources[cat] && storage.customSources[cat][typ]) || [];

        var e    = React.createElement;
        var SV   = RN.ScrollView;
        var V    = RN.View;
        var T    = RN.Text;
        var TI   = RN.TextInput;
        var TO   = RN.TouchableOpacity;

        var Pill = function(label, active, fn, mr) {
            return e(TO, { onPress: fn, style: { flex:1, padding:10, backgroundColor: active?"#5865F2":"#2B2D31", borderRadius:8, alignItems:"center", marginRight:mr||0 } },
                e(T, { style:{ color:"#fff", fontWeight:"bold" } }, label));
        };

        return e(SV, { style:{flex:1}, contentContainerStyle:{padding:16} },

            // Tabs
            e(V, { style:{flexDirection:"row", marginBottom:16} },
                Pill("📦 Packs", tab==="packs", function(){setTab("packs");}, 8),
                Pill("✏️ Custom", tab==="custom", function(){setTab("custom");})
            ),

            // ── Packs tab ──
            tab==="packs" && e(V, null,
                e(T, { style:{color:"#aaa", marginBottom:12, fontSize:13} },
                    "Waifu.pics SFW is always on by default. Enable extra packs here."
                ),
                PRESET_PACKS.map(function(pack) {
                    var on = epacks.indexOf(pack.id) > -1;
                    return e(TO, { key:pack.id, onPress:function(){ var i=storage.enabledPacks.indexOf(pack.id); if(i>-1) storage.enabledPacks.splice(i,1); else storage.enabledPacks.push(pack.id); refresh(); },
                        style:{backgroundColor:on?"#1a3a6e":"#2B2D31", borderRadius:10, padding:14, marginBottom:10, borderWidth:1, borderColor:on?"#5865F2":"#444"} },
                        e(V, {style:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}},
                            e(T, {style:{color:"#fff",fontWeight:"bold",fontSize:15,flex:1}}, pack.label),
                            e(T, {style:{fontSize:18}}, on?"✅":"⬜")
                        ),
                        e(T, {style:{color:"#aaa",fontSize:12,marginTop:4}}, pack.description)
                    );
                })
            ),

            // ── Custom tab ──
            tab==="custom" && e(V, null,
                e(V, {style:{flexDirection:"row",marginBottom:8}},
                    Pill("SFW",  cat==="sfw",  function(){setCat("sfw"); }, 8),
                    Pill("NSFW", cat==="nsfw", function(){setCat("nsfw");})
                ),
                e(V, {style:{flexDirection:"row",marginBottom:12}},
                    Pill("Femboy", typ==="femboy", function(){setTyp("femboy");}, 8),
                    Pill("Tomboy", typ==="tomboy", function(){setTyp("tomboy");})
                ),
                e(T, {style:{color:"#aaa",fontSize:12,marginBottom:8}},
                    "Type a subreddit name (e.g. femboymemes) OR a full URL (e.g. https://api.waifu.pics/sfw/waifu)"
                ),
                e(TI, {
                    style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:8},
                    placeholder:"subreddit name or https://...", placeholderTextColor:"#555",
                    value:inp, onChangeText:setInp, autoCapitalize:"none", autoCorrect:false
                }),
                e(TO, { onPress:function(){
                    var v=inp.trim();
                    if(!v||custom.indexOf(v)>-1) return;
                    storage.customSources[cat][typ].push(v);
                    setInp(""); refresh();
                }, style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center",marginBottom:20} },
                    e(T, {style:{color:"#fff",fontWeight:"bold"}}, "+ Add Source")
                ),
                e(T, {style:{color:"#fff",fontWeight:"bold",marginBottom:8}}, "Your sources — "+cat.toUpperCase()+" / "+typ+":"),
                custom.length===0
                    ? e(T, {style:{color:"#555",fontStyle:"italic"}}, "None yet. Defaults (waifu.pics) always active.")
                    : custom.map(function(src,idx){
                        return e(V, {key:idx, style:{flexDirection:"row",alignItems:"center",backgroundColor:"#2B2D31",padding:10,borderRadius:8,marginBottom:8}},
                            e(T, {style:{color:"#ddd",flex:1,marginRight:8},numberOfLines:1}, src),
                            e(TO, {onPress:function(){ storage.customSources[cat][typ].splice(idx,1); refresh(); }},
                                e(T, {style:{color:"#ff5555",fontWeight:"bold",fontSize:16}}, "✕")
                            )
                        );
                    })
            )
        );
    };

    // ── Commands (using registerCommand — same as GlobalSearch) ───────────────────
    var unregFns = [];
    var activeGuesses = {};

    // /ftest — no fetch, no storage, just proves commands work
    unregFns.push(registerCommand({
        name: "ftest",
        untranslatedName: "ftest",
        description: "Debug: proves the plugin is alive",
        execute: async function() {
            return { content: "✅ FemboyTomboyGuess plugin is working!" };
        }
    }));

    var combos = [["femboy","sfw"],["femboy","nsfw"],["tomboy","sfw"],["tomboy","nsfw"]];
    combos.forEach(function(pair) {
        var type = pair[0]; var cat = pair[1];
        var name = cat==="nsfw" ? "nsfw_"+type : type;

        unregFns.push(registerCommand({
            name: name,
            untranslatedName: name,
            description: "Send a "+cat.toUpperCase()+" "+type+" image",
            execute: async function() {
                var url = await fetchMedia(type, cat, false);
                return { content: url || "❌ All sources failed. Try /ftest first." };
            }
        }));

        unregFns.push(registerCommand({
            name: name+"_video",
            untranslatedName: name+"_video",
            description: "Send a "+cat.toUpperCase()+" "+type+" video",
            execute: async function() {
                var url = await fetchMedia(type, cat, true);
                return { content: url || "❌ No video found. Most sources are images only." };
            }
        }));
    });

    unregFns.push(registerCommand({
        name: "guess",
        untranslatedName: "guess",
        description: "Femboy or Tomboy guessing game",
        execute: async function(args, ctx) {
            var type = Math.random() > 0.5 ? "femboy" : "tomboy";
            var url  = await fetchMedia(type, "sfw", false);
            if (!url) return { content: "❌ Fetch failed. Make sure you can see images with /femboy first." };
            if (ctx && ctx.channel) activeGuesses[ctx.channel.id] = type;
            return { content: "📸 **Femboy or Tomboy?** Tap the spoiler when ready!\n\n||Answer: **"+type+"**||\n"+url };
        }
    }));

    exports.onUnload = function() {
        unregFns.forEach(function(fn) { try { fn(); } catch(e) {} });
        unregFns = [];
        activeGuesses = {};
    };

    return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
                                                                       
