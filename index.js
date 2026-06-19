(function(exports, patcher, metro, storage) {
    "use strict";

    var registerCommand = vendetta.commands.registerCommand;
    var React = metro.findByProps("createElement", "useState");
    var RN    = metro.findByProps("ScrollView", "TextInput", "TouchableOpacity");

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

    var PRESET_PACKS = [
        {
            id: "reddit-sfw", label: "📋 Reddit SFW",
            description: "Femboy & tomboy subreddits via meme-api.com",
            sources: { sfw: { femboy: ["femboymemes","MildFemboys","feminineboys"], tomboy: ["tomboy","tomboys","AnimeTomboys"] } }
        },
        {
            id: "reddit-nsfw", label: "🔞 Reddit NSFW",
            description: "NSFW subreddits via meme-api.com",
            sources: { nsfw: { femboy: ["femboy","traditionalfemboys"], tomboy: ["tomboygf"] } }
        },
        {
            id: "waifupics-sfw", label: "🌸 Waifu.pics SFW",
            description: "Extra anime SFW from api.waifu.pics",
            sources: { sfw: { femboy: ["https://api.waifu.pics/sfw/waifu","https://api.waifu.pics/sfw/shinobu"], tomboy: ["https://api.waifu.pics/sfw/neko"] } }
        },
        {
            id: "waifupics-nsfw", label: "🔞🌸 Waifu.pics NSFW",
            description: "Anime NSFW from api.waifu.pics",
            sources: { nsfw: { femboy: ["https://api.waifu.pics/nsfw/waifu"], tomboy: ["https://api.waifu.pics/nsfw/neko"] } }
        },
        {
            id: "nekoslife", label: "🐱 Nekos.life SFW",
            description: "Anime SFW from nekos.life",
            sources: { sfw: { femboy: ["https://nekos.life/api/v2/img/neko","https://nekos.life/api/v2/img/meow"], tomboy: ["https://nekos.life/api/v2/img/neko"] } }
        }
    ];

    if (!storage.customSources) storage.customSources = { sfw: { femboy: [], tomboy: [] }, nsfw: { femboy: [], tomboy: [] } };
    if (!storage.enabledPacks)  storage.enabledPacks  = [];

    var isImage = function(u) { return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(u); };
    var isVideo = function(u) { return /\.(mp4|webm)(\?.*)?$/i.test(u); };

    function buildSources(type, cat) {
        var sources = [];
        var def = DEFAULT_SOURCES[cat] && DEFAULT_SOURCES[cat][type];
        if (def) for (var d = 0; d < def.length; d++) sources.push(def[d]);
        var packs = storage.enabledPacks || [];
        for (var pi = 0; pi < packs.length; pi++) {
            for (var pp = 0; pp < PRESET_PACKS.length; pp++) {
                if (PRESET_PACKS[pp].id === packs[pi]) {
                    var s = PRESET_PACKS[pp].sources && PRESET_PACKS[pp].sources[cat] && PRESET_PACKS[pp].sources[cat][type];
                    if (s) for (var si = 0; si < s.length; si++) sources.push(s[si]);
                }
            }
        }
        var custom = storage.customSources && storage.customSources[cat] && storage.customSources[cat][type];
        if (custom) for (var ci = 0; ci < custom.length; ci++) sources.push(custom[ci]);
        return sources;
    }

    function fetchMedia(type, cat, wantVideo) {
        var filter  = wantVideo ? isVideo : isImage;
        var sources = buildSources(type, cat);
        if (sources.length === 0) return Promise.resolve(null);

        function attempt(i) {
            if (i >= 10) return Promise.resolve(null);
            var src = sources[Math.floor(Math.random() * sources.length)];
            if (src.indexOf("http") === 0) {
                return fetch(src, { headers: { "User-Agent": "RevengePlugin/1.0" } })
                    .then(function(res) {
                        if (!res.ok) return attempt(i + 1);
                        var ct = res.headers.get("content-type") || "";
                        if (ct.indexOf("image/") > -1 || ct.indexOf("video/") > -1) {
                            return filter(src) ? src : attempt(i + 1);
                        }
                        return res.json().then(function(data) {
                            var url = data.url || data.file || data.message || data.src || data.image || "";
                            return (url && filter(url)) ? url : attempt(i + 1);
                        });
                    })
                    .catch(function() { return attempt(i + 1); });
            } else {
                return fetch("https://meme-api.com/gimme/" + src, { headers: { "User-Agent": "RevengePlugin/1.0" } })
                    .then(function(r) {
                        if (!r.ok) return attempt(i + 1);
                        return r.json().then(function(d) {
                            return (d && d.url && filter(d.url) && !d.nsfw) ? d.url : attempt(i + 1);
                        });
                    })
                    .catch(function() { return attempt(i + 1); });
            }
        }
        return attempt(0);
    }

    // ── Settings UI ───────────────────────────────────────────────────────────────
    exports.settings = function SettingsView() {
        var tabS  = React.useState("packs");  var tab = tabS[0];  var setTab  = tabS[1];
        var catS  = React.useState("sfw");    var cat = catS[0];  var setCat  = catS[1];
        var typS  = React.useState("femboy"); var typ = typS[0];  var setTyp  = typS[1];
        var inpS  = React.useState("");       var inp = inpS[0];  var setInp  = inpS[1];
        var tikS  = React.useState(0);        var setTik = tikS[1];
        var refresh = function() { setTik(function(t) { return t + 1; }); };

        var epacks = storage.enabledPacks || [];
        var custom = (storage.customSources && storage.customSources[cat] && storage.customSources[cat][typ]) || [];
        var e = React.createElement;
        var SV = RN.ScrollView; var V = RN.View; var T = RN.Text;
        var TI = RN.TextInput;  var TO = RN.TouchableOpacity;

        function Pill(label, active, fn, mr) {
            return e(TO, { onPress: fn, style: { flex:1, padding:10, backgroundColor:active?"#5865F2":"#2B2D31", borderRadius:8, alignItems:"center", marginRight:mr||0 } },
                e(T, { style: { color:"#fff", fontWeight:"bold" } }, label));
        }

        return e(SV, { style:{flex:1}, contentContainerStyle:{padding:16} },
            e(V, { style:{flexDirection:"row",marginBottom:16} },
                Pill("📦 Packs",  tab==="packs",  function(){setTab("packs"); }, 8),
                Pill("✏️ Custom", tab==="custom", function(){setTab("custom");})
            ),
            tab==="packs" && e(V, null,
                e(T, {style:{color:"#aaa",marginBottom:12,fontSize:13}}, "Waifu.pics SFW is always on. Enable extras here."),
                PRESET_PACKS.map(function(pack) {
                    var on = epacks.indexOf(pack.id) > -1;
                    return e(TO, { key:pack.id,
                        onPress: function() {
                            var i = storage.enabledPacks.indexOf(pack.id);
                            if (i > -1) storage.enabledPacks.splice(i, 1); else storage.enabledPacks.push(pack.id);
                            refresh();
                        },
                        style:{backgroundColor:on?"#1a3a6e":"#2B2D31",borderRadius:10,padding:14,marginBottom:10,borderWidth:1,borderColor:on?"#5865F2":"#444"}
                    },
                        e(V,{style:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}},
                            e(T,{style:{color:"#fff",fontWeight:"bold",fontSize:15,flex:1}},pack.label),
                            e(T,{style:{fontSize:18}},on?"✅":"⬜")
                        ),
                        e(T,{style:{color:"#aaa",fontSize:12,marginTop:4}},pack.description)
                    );
                })
            ),
            tab==="custom" && e(V, null,
                e(V,{style:{flexDirection:"row",marginBottom:8}},
                    Pill("SFW",cat==="sfw",function(){setCat("sfw");},8),
                    Pill("NSFW",cat==="nsfw",function(){setCat("nsfw");})
                ),
                e(V,{style:{flexDirection:"row",marginBottom:12}},
                    Pill("Femboy",typ==="femboy",function(){setTyp("femboy");},8),
                    Pill("Tomboy",typ==="tomboy",function(){setTyp("tomboy");})
                ),
                e(T,{style:{color:"#aaa",fontSize:12,marginBottom:8}},
                    "Subreddit name (e.g. femboymemes) OR full URL (e.g. https://api.waifu.pics/sfw/waifu)"
                ),
                e(TI,{
                    style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:8},
                    placeholder:"subreddit or https://...", placeholderTextColor:"#555",
                    value:inp, onChangeText:setInp, autoCapitalize:"none", autoCorrect:false
                }),
                e(TO,{
                    onPress:function(){
                        var v=inp.trim();
                        if(!v||custom.indexOf(v)>-1) return;
                        storage.customSources[cat][typ].push(v);
                        setInp(""); refresh();
                    },
                    style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center",marginBottom:20}
                }, e(T,{style:{color:"#fff",fontWeight:"bold"}},"+ Add Source")),
                e(T,{style:{color:"#fff",fontWeight:"bold",marginBottom:8}},"Your sources — "+cat.toUpperCase()+" / "+typ+":"),
                custom.length===0
                    ? e(T,{style:{color:"#555",fontStyle:"italic"}},"None yet. Defaults always active.")
                    : custom.map(function(src,idx){
                        return e(V,{key:idx,style:{flexDirection:"row",alignItems:"center",backgroundColor:"#2B2D31",padding:10,borderRadius:8,marginBottom:8}},
                            e(T,{style:{color:"#ddd",flex:1,marginRight:8},numberOfLines:1},src),
                            e(TO,{onPress:function(){storage.customSources[cat][typ].splice(idx,1);refresh();}},
                                e(T,{style:{color:"#ff5555",fontWeight:"bold",fontSize:16}},"✕")
                            )
                        );
                    })
            )
        );
    };

    // ── Commands ──────────────────────────────────────────────────────────────────
    var unregFns = [];

    // Tracks active /guess games per channel: { channelId: "femboy"/"tomboy" }
    var activeGuesses = {};

    // /ftest
    unregFns.push(registerCommand({
        name: "ftest", untranslatedName: "ftest",
        description: "Debug: proves plugin loaded correctly",
        execute: function() {
            return Promise.resolve({ content: "✅ FemboyTomboyGuess loaded!" });
        }
    }));

    // Image + video commands for all 4 combos
    var combos = [["femboy","sfw"],["femboy","nsfw"],["tomboy","sfw"],["tomboy","nsfw"]];
    combos.forEach(function(pair) {
        var type = pair[0]; var cat = pair[1];
        var name = cat === "nsfw" ? "nsfw_" + type : type;

        unregFns.push(registerCommand({
            name: name, untranslatedName: name,
            description: "Send a " + cat.toUpperCase() + " " + type + " image",
            execute: function() {
                return fetchMedia(type, cat, false).then(function(url) {
                    return { content: url || "❌ All sources failed. Check your internet." };
                });
            }
        }));

        unregFns.push(registerCommand({
            name: name + "_video", untranslatedName: name + "_video",
            description: "Send a " + cat.toUpperCase() + " " + type + " video",
            execute: function() {
                return fetchMedia(type, cat, true).then(function(url) {
                    return { content: url || "❌ No video found. Most sources are images only." };
                });
            }
        }));
    });

    // /guess — sends image WITHOUT revealing the answer
    unregFns.push(registerCommand({
        name: "guess", untranslatedName: "guess",
        description: "Start a Femboy or Tomboy guessing game",
        execute: function(args, ctx) {
            var type = Math.random() > 0.5 ? "femboy" : "tomboy";
            var channelId = ctx && ctx.channel && ctx.channel.id;
            return fetchMedia(type, "sfw", false).then(function(url) {
                if (!url) return { content: "❌ Fetch failed. Make sure /femboy works first." };
                // Store answer secretly — revealed only when /answer is used
                if (channelId) activeGuesses[channelId] = type;
                return { content: "📸 **Femboy or Tomboy?**\nLook at the image and use `/answer` to submit your guess!\n\n" + url };
            });
        }
    }));

    // /answer — dropdown lets you pick femboy or tomboy, then reveals if correct
    unregFns.push(registerCommand({
        name: "answer", untranslatedName: "answer",
        description: "Submit your guess for the current /guess game",
        options: [
            {
                name: "choice",
                displayName: "choice",
                description: "Your guess",
                type: 3,
                required: true,
                choices: [
                    { name: "femboy", displayName: "femboy", value: "femboy" },
                    { name: "tomboy", displayName: "tomboy", value: "tomboy" }
                ]
            }
        ],
        execute: function(args, ctx) {
            var channelId = ctx && ctx.channel && ctx.channel.id;
            var correct   = channelId && activeGuesses[channelId];

            if (!correct) {
                return Promise.resolve({ content: "❌ No active game in this channel! Use `/guess` to start one." });
            }

            var guess  = args && args[0] && args[0].value;
            var won    = guess === correct;
            var result = won
                ? "✅ **Correct!** It was a **" + correct + "**! Well done!"
                : "❌ **Wrong!** It was a **" + correct + "**, not a " + guess + "!";

            delete activeGuesses[channelId];
            return Promise.resolve({ content: result });
        }
    }));

    exports.onUnload = function() {
        for (var i = 0; i < unregFns.length; i++) {
            try { unregFns[i](); } catch(e) {}
        }
        unregFns = [];
        activeGuesses = {};
    };

    return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
                                    
