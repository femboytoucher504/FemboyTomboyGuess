(function(exports, patcher, metro, storage) {
"use strict";
var React = metro.findByProps("createElement", "useState");
var RN = metro.findByProps("ScrollView", "TextInput", "TouchableOpacity");
var MA = metro.findByProps("sendMessage", "sendBotMessage");
var ChannelStore = metro.findByProps("getLastSelectedChannelId");

function getChannelId(ctx) {
    try { if (ctx && ctx.channel && ctx.channel.id) return ctx.channel.id; } catch(e) {}
    try { if (ctx && ctx.channelId) return ctx.channelId; } catch(e) {}
    try { return ChannelStore.getLastSelectedChannelId(); } catch(e) {}
    return null;
}

function send(cid, text) {
    try { MA.sendMessage(cid, { content: String(text), tts: false }, null, { nonce: Date.now().toString() }); return; } catch(e) {}
    try { MA.sendBotMessage(cid, text); } catch(e) {}
}

function sendPrivate(cid, text) {
    try { MA.sendBotMessage(cid, String(text)); } catch(e) {}
}

function cacheBust(url) {
    var sep = url.indexOf("?") > -1 ? "&" : "?";
    return url + sep + "_cb=" + Date.now() + Math.floor(Math.random() * 100000);
}

function labelFor(src) {
    if (src.indexOf("http") === 0) {
        var m = src.match(/^https?:\/\/([^\/]+)/);
        return m ? m[1] : src;
    }
    return "r/" + src + " (reddit.com)";
}

function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

var REDDIT_UA = "Mozilla/5.0 (Linux; Android 10; Mobile)";

// FIXED: Uses public Reddit API - NO OAuth needed!
function fetchRedditPost(sub, filterFn, requireSfw) {
    var url = "https://www.reddit.com/r/" + sub + "/hot.json?limit=100";    return fetch(cacheBust(url), { headers: { "User-Agent": REDDIT_UA } })
        .then(function(res) {
            if (!res.ok) return { url: null, reason: "HTTP " + res.status };
            return res.json().then(function(json) {
                var posts = (json && json.data && json.data.children) || [];
                var candidates = [];
                for (var i = 0; i < posts.length; i++) {
                    var d = posts[i] && posts[i].data;
                    if (!d || !d.url) continue;
                    if (requireSfw && d.over_18) continue;
                    if (filterFn(d.url)) candidates.push(d.url);
                }
                if (!candidates.length) return { url: null, reason: "no matching posts" };
                return { url: candidates[Math.floor(Math.random() * candidates.length)], reason: null };
            });
        }).catch(function(err) { return { url: null, reason: err.message || "error" }; });
}

var DEFAULT_SOURCES = {
    sfw: {
        femboy: ["https://nekos.best/api/v2/waifu"],
        tomboy: ["https://nekos.best/api/v2/neko"]
    },
    nsfw: {
        femboy: [],
        tomboy: []
    }
};

var PRESET_PACKS = [
    { id: "reddit-sfw", label: "Reddit SFW", description: "Human SFW from Reddit (NO API KEY!)", sources:{ sfw:{ femboy:["femboymemes", "MildFemboys", "feminineboys"], tomboy:["tomboy", "tomboys"] } } },
    { id: "reddit-nsfw", label: "Reddit NSFW", description: "Human NSFW from Reddit (NO API KEY!)", sources:{ nsfw:{ femboy:["femboy", "traditionalfemboys", "femboyhentai"], tomboy:["tomboygf"] } } },
    { id: "nekos-sfw", label: "Nekos.best SFW", description: "Anime SFW", sources:{ sfw:{ femboy:["https://nekos.best/api/v2/waifu"], tomboy:["https://nekos.best/api/v2/neko"] } } }
];

if (!storage.customSources) storage.customSources = { sfw:{ femboy:[], tomboy:[] }, nsfw:{ femboy:[], tomboy:[] } };
if (!storage.enabledPacks) storage.enabledPacks = [];

var isImage = function(u) { return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u); };
var isVideo = function(u) { return /\.(mp4|webm|gifv|mov)(\?.*)?$/i.test(u); };
var isAny = function() { return true; };

function buildSources(type, cat) {
    var out = [], def = DEFAULT_SOURCES[cat] && DEFAULT_SOURCES[cat][type];
    if (def) for (var d = 0; d < def.length; d++) out.push(def[d]);
    var pks = storage.enabledPacks || [];
    for (var pi = 0; pi < pks.length; pi++) for (var pp = 0; pp < PRESET_PACKS.length; pp++) {
        if (PRESET_PACKS[pp].id === pks[pi]) {
            var s = PRESET_PACKS[pp].sources && PRESET_PACKS[pp].sources[cat] && PRESET_PACKS[pp].sources[cat][type];
            if (s) for (var si = 0; si < s.length; si++) out.push(s[si]);        }
    }
    var cu = storage.customSources && storage.customSources[cat] && storage.customSources[cat][type];
    if (cu) for (var ci = 0; ci < cu.length; ci++) out.push(cu[ci]);
    return out;
}

function fetchMedia(type, cat, wantVideo) {
    var filter = wantVideo ? isVideo : isImage;
    var sources = shuffle(buildSources(type, cat));
    var log = [];
    if (!sources.length) return Promise.resolve({ url: null, source: null, log: ["no sources"] });

    function attempt(idx) {
        if (idx >= sources.length) return Promise.resolve({ url: null, source: null, log: log });
        var src = sources[idx];
        var label = labelFor(src);

        if (src.indexOf("http") === 0) {
            return fetch(cacheBust(src), { headers: { "User-Agent": "RevengePlugin/1.0" } })
                .then(function(res) {
                    if (!res.ok) { log.push(label + ": HTTP " + res.status); return attempt(idx + 1); }
                    var ct = res.headers.get("content-type") || "";
                    if (ct.indexOf("image/") > -1 || ct.indexOf("video/") > -1) {
                        if (filter(src)) return { url: src, source: label, log: log };
                        log.push(label + ": wrong type"); return attempt(idx + 1);
                    }
                    return res.json().then(function(d) {
                        var u = d.url || d.file || d.message || d.src || d.image || "";
                        if (u && filter(u)) return { url: u, source: label, log: log };
                        log.push(label + ": no url");
                        return attempt(idx + 1);
                    });
                }).catch(function(err) { log.push(label + ": " + err.message); return attempt(idx + 1); });
        }
        
        // Reddit source - uses public API now
        return fetchRedditPost(src, filter, cat === "sfw").then(function(result) {
            if (result.url) return { url: result.url, source: label, log: log };
            log.push(label + ": " + result.reason);
            return attempt(idx + 1);
        });
    }
    return attempt(0);
}

var recentUrls = {};
function fetchMediaDedup(type, cat, wantVideo) {
    var key = type + ":" + cat + ":" + (wantVideo ? "v" : "i");
    if (!recentUrls[key]) recentUrls[key] = [];    function tryFetch(retries) {
        return fetchMedia(type, cat, wantVideo).then(function(result) {
            if (!result.url) return result;
            if (retries <= 0 || recentUrls[key].indexOf(result.url) === -1) {
                recentUrls[key].push(result.url);
                if (recentUrls[key].length > 15) recentUrls[key].shift();
                return result;
            }
            return tryFetch(retries - 1);
        });
    }
    return tryFetch(2);
}

exports.settings = function SettingsView() {
    var tabS = React.useState("packs"); var tab = tabS[0]; var setTab = tabS[1];
    var catS = React.useState("sfw"); var cat = catS[0]; var setCat = catS[1];
    var typS = React.useState("femboy"); var typ = typS[0]; var setTyp = typS[1];
    var inpS = React.useState(""); var inp = inpS[0]; var setInp = inpS[1];
    var tikS = React.useState(0); var setTik = tikS[1];
    var refresh = function() { setTik(function(t) { return t + 1; }); };
    var epacks = storage.enabledPacks || [];
    var custom = (storage.customSources && storage.customSources[cat] && storage.customSources[cat][typ]) || [];
    var e = React.createElement, SV = RN.ScrollView, V = RN.View, T = RN.Text, TI = RN.TextInput, TO = RN.TouchableOpacity;
    
    function Pill(label, active, fn, mr) {
        return e(TO, { onPress: fn, style: { flex:1, padding:9, backgroundColor:active? "#5865F2" : "#2B2D31", borderRadius:8, alignItems:"center", marginRight:mr||0 } },
            e(T, { style: { color: "#fff", fontWeight: "bold", fontSize:13 } }, label));
    }

    return e(SV, { style:{flex:1}, contentContainerStyle:{padding:16} },
        e(V, { style:{flexDirection:"row",marginBottom:16} },
            Pill("Packs", tab==="packs", function(){setTab("packs");}, 6),
            Pill("Custom", tab==="custom", function(){setTab("custom");})
        ),
        tab==="packs" && e(V, null,
            e(T, {style:{color:"#aaa",marginBottom:12,fontSize:13}}, "Reddit packs use Public JSON - NO API KEY NEEDED!"),
            PRESET_PACKS.map(function(pack) {
                var on = epacks.indexOf(pack.id) > -1;
                return e(TO, { key:pack.id, onPress:function() { var i=storage.enabledPacks.indexOf(pack.id); if(i>-1) storage.enabledPacks.splice(i,1); else storage.enabledPacks.push(pack.id); refresh(); },
                    style:{backgroundColor:on? "#1a3a6e" : "#2B2D31",borderRadius:10,padding:14,marginBottom:10,borderWidth:1,borderColor:on? "#5865F2" : "#444"} },
                    e(V, {style:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}},
                        e(T, {style:{color:"#fff",fontWeight:"bold",fontSize:15,flex:1}}, pack.label),
                        e(T, {style:{fontSize:18}}, on? "✅" : "")),
                    e(T, {style:{color:"#aaa",fontSize:12,marginTop:4}}, pack.description));
            })
        ),
        tab==="custom" && e(V, null,
            e(V, {style:{flexDirection:"row",marginBottom:8}},
                Pill("SFW", cat==="sfw", function(){setCat("sfw");}, 8),                Pill("NSFW", cat==="nsfw", function(){setCat("nsfw");})),
            e(V, {style:{flexDirection:"row",marginBottom:12}},
                Pill("Femboy", typ==="femboy", function(){setTyp("femboy");}, 8),
                Pill("Tomboy", typ==="tomboy", function(){setTyp("tomboy");})),
            e(T, {style:{color:"#aaa",fontSize:12,marginBottom:8}}, "Subreddit name OR full URL"),
            e(TI, { style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:8},
                placeholder:"subreddit or https://...", placeholderTextColor:"#555",
                value:inp, onChangeText:setInp, autoCapitalize:"none", autoCorrect:false }),
            e(TO, { onPress:function() { var v=inp.trim(); if(!v||custom.indexOf(v)>-1) return; storage.customSources[cat][typ].push(v); setInp(""); refresh(); },
                style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center",marginBottom:20} },
                e(T, {style:{color:"#fff",fontWeight:"bold"}}, "+ Add Source")),
            e(T, {style:{color:"#fff",fontWeight:"bold",marginBottom:8}}, "Your sources - "+cat.toUpperCase()+" / "+typ+":"),
            custom.length===0 ? e(T, {style:{color:"#555",fontStyle:"italic"}}, "None yet.") :
                custom.map(function(src, idx) {
                    return e(V, {key:idx, style:{flexDirection:"row",alignItems:"center",backgroundColor:"#2B2D31",padding:10,borderRadius:8,marginBottom:8}},
                        e(T, {style:{color:"#ddd",flex:1,marginRight:8}, numberOfLines:1}, src),
                        e(TO, {onPress:function(){storage.customSources[cat][typ].splice(idx,1);refresh();}}, e(T, {style:{color:"#ff5555",fontWeight:"bold",fontSize:16}}, "X")));
                })
        )
    );
};

var unregFns = [];

exports.onLoad = function() {
    var registerCommand = vendetta.commands.registerCommand;

    var combos = [["femboy", "sfw"],["femboy", "nsfw"],["tomboy", "sfw"],["tomboy", "nsfw"]];
    combos.forEach(function(pair) {
        var type = pair[0], cat = pair[1], name = cat==="nsfw" ? "nsfw_"+type : type;

        unregFns.push(registerCommand({
            name: name, untranslatedName: name,
            description: "Send "+cat.toUpperCase()+" "+type+" image",
            execute: function(args, ctx) {
                var cid = getChannelId(ctx);
                fetchMediaDedup(type, cat, false).then(function(result) {
                    if (result.url) { send(cid, result.url); sendPrivate(cid, "Source: " + result.source); }
                    else sendPrivate(cid, "All sources failed.\nDebug:\n" + result.log.slice(0, 8).join("\n"));
                });
            }
        }));

        unregFns.push(registerCommand({
            name: name+"_video", untranslatedName: name+"_video",
            description: "Send "+cat.toUpperCase()+" "+type+" VIDEO",
            execute: function(args, ctx) {
                var cid = getChannelId(ctx);
                sendPrivate(cid, "Fetching video...");
                fetchMediaDedup(type, cat, true).then(function(result) {                    if (result.url) { send(cid, result.url); sendPrivate(cid, "Source: " + result.source); }
                    else sendPrivate(cid, "No video found.\nDebug:\n" + result.log.slice(0, 8).join("\n"));
                });
            }
        }));
    });
};

exports.onUnload = function() {
    for (var i = 0; i < unregFns.length; i++) try { unregFns[i](); } catch(e) {}
    unregFns = [];
};

return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
