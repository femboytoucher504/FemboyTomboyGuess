(function(exports, patcher, metro, storage) {
"use strict";

var React = metro.findByProps("createElement", "useState");
var RN    = metro.findByProps("ScrollView", "TextInput", "TouchableOpacity");
var MA    = metro.findByProps("sendMessage", "sendBotMessage");
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

// Pure-JS base64 encode — Hermes has no built-in btoa
function base64Encode(str) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "", i = 0;
    while (i < str.length) {
        var c1 = str.charCodeAt(i++), c2 = str.charCodeAt(i++), c3 = str.charCodeAt(i++);
        var e1 = c1 >> 2;
        var e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
        var e3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (c3 >> 6));
        var e4 = isNaN(c3) ? 64 : (c3 & 63);
        output += chars.charAt(e1) + chars.charAt(e2) + chars.charAt(e3) + chars.charAt(e4);
    }
    return output;
}

function labelFor(src) {
    if (src.indexOf("http") === 0) {
        var m = src.match(/^https?:\/\/([^\/]+)/);
        return m ? m[1] : src;
    }
    return "r/" + src + " (reddit.com)";}

function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

// ── Reddit OAuth (installed-app, client-id only, no secret) ──────────────────
var REDDIT_UA = "android:com.femboytomboyguess.plugin:v1.0 (by /u/anonymous)";

function fetchRedditToken(clientId) {
    var body = "grant_type=" + encodeURIComponent("https://oauth.reddit.com/grants/installed_client") +
               "&device_id=" + encodeURIComponent("DO_NOT_TRACK_THIS_DEVICE");
    return fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
            "Authorization": "Basic " + base64Encode(clientId + ":"),
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": REDDIT_UA
        },
        body: body
    }).then(function(res) {
        if (!res.ok) throw new Error("Token request failed: HTTP " + res.status);
        return res.json();
    }).then(function(json) {
        if (!json || !json.access_token) throw new Error("No access_token in response");
        storage.redditToken = json.access_token;
        storage.redditTokenExpiry = Date.now() + ((json.expires_in || 3600) * 1000);
        return json.access_token;
    });
}

function getRedditToken() {
    var now = Date.now();
    if (storage.redditToken && storage.redditTokenExpiry && now < storage.redditTokenExpiry - 60000) {
        return Promise.resolve(storage.redditToken);
    }
    var clientId = storage.redditClientId;
    if (!clientId) return Promise.resolve(null);
    return fetchRedditToken(clientId).catch(function() { return null; });
}

function fetchRedditPost(sub, filterFn, requireSfw) {
    return getRedditToken().then(function(token) {
        if (!token) return { url: null, reason: "No Reddit Client ID set. Add one in plugin settings → 🔑 Reddit tab." };
        var url = "https://oauth.reddit.com/r/" + sub + "/hot?limit=50";        return fetch(cacheBust(url), { headers: { "Authorization": "Bearer " + token, "User-Agent": REDDIT_UA } })
            .then(function(res) {
                if (res.status === 401) {
                    storage.redditToken = null; storage.redditTokenExpiry = null;
                    return { url: null, reason: "Reddit token expired, try again" };
                }
                if (!res.ok) return { url: null, reason: "HTTP " + res.status + " from oauth.reddit.com" };
                return res.json().then(function(json) {
                    var posts = (json && json.data && json.data.children) || [];
                    var candidates = [];
                    for (var i = 0; i < posts.length; i++) {
                        var d = posts[i] && posts[i].data;
                        if (!d || !d.url) continue;
                        if (d.is_video) continue;
                        if (requireSfw && d.over_18) continue;
                        if (filterFn(d.url)) candidates.push(d.url);
                    }
                    if (!candidates.length) return { url: null, reason: "no matching posts found on r/" + sub };
                    return { url: candidates[Math.floor(Math.random() * candidates.length)], reason: null };
                });
            }).catch(function(err) { return { url: null, reason: (err && err.message) || "fetch error" }; });
    });
}

// ── NEW: Reddit Subreddit Search ─────────────────────────────────────────────
function searchRedditSubreddits(query) {
    return getRedditToken().then(function(token) {
        if (!token) return { subs: [], reason: "No Reddit Client ID set." };
        var url = "https://oauth.reddit.com/subreddits/search?q=" + encodeURIComponent(query) + "&limit=10";
        return fetch(cacheBust(url), { headers: { "Authorization": "Bearer " + token, "User-Agent": REDDIT_UA } })
            .then(function(res) { return res.json(); })
            .then(function(json) {
                var children = (json && json.data && json.data.children) || [];
                var subs = children.map(function(c) {
                    return { name: c.data.display_name, subs: c.data.subscribers };
                });
                return { subs: subs, reason: null };
            });
    }).catch(function(err) { return { subs: [], reason: err.message }; });
}

// ── NEW: Booru / Gallery Fetcher ─────────────────────────────────────────────
function fetchFromBooru(site, tags, isNsfw) {
    // Safebooru for SFW, Rule34 for NSFW
    var baseUrl = isNsfw ? "https://api.rule34.xxx/index.php" : "https://safebooru.org/index.php";
    var url = baseUrl + "?page=dapi&s=post&q=index&json=1&tags=" + encodeURIComponent(tags) + "&limit=20";
    
    return fetch(cacheBust(url), { headers: { "User-Agent": "RevengePlugin/1.0" } })
        .then(function(res) { return res.json(); })
        .then(function(posts) {            if (!posts || !Array.isArray(posts) || !posts.length) return { url: null, reason: "No posts found for tags: " + tags };
            var valid = posts.filter(function(p) {
                return p.file_url && (isImage(p.file_url) || isVideo(p.file_url));
            });
            if (!valid.length) return { url: null, reason: "No valid media files found for tags: " + tags };
            var pick = valid[Math.floor(Math.random() * valid.length)];
            return { url: pick.file_url, source: site + " (booru)", log: [] };
        }).catch(function(err) { return { url: null, reason: err.message }; });
}

// ── Sources ───────────────────────────────────────────────────────────────────
var DEFAULT_SOURCES = {
    sfw: {
        femboy: ["https://nekos.best/api/v2/waifu", "https://api.waifu.pics/sfw/waifu", "https://api.waifu.pics/sfw/shinobu"],
        tomboy: ["https://nekos.best/api/v2/neko", "https://api.waifu.pics/sfw/neko"]
    },
    nsfw: {
        femboy: ["https://api.waifu.pics/nsfw/waifu"],
        tomboy: ["https://api.waifu.pics/nsfw/neko"]
    }
};

var PRESET_PACKS = [
    { id: "reddit-sfw",    label: "📋 Reddit SFW",        description: "Femboy & tomboy subreddits (needs Reddit Client ID)", sources:{ sfw:{ femboy:["femboymemes", "MildFemboys", "feminineboys"], tomboy:["tomboy", "tomboys", "AnimeTomboys"] } } },
    { id: "reddit-nsfw",   label: "🔞 Reddit NSFW",       description: "NSFW subreddits (needs Reddit Client ID)",            sources:{ nsfw:{ femboy:["femboy", "traditionalfemboys"], tomboy:["tomboygf"] } } },
    { id: "waifupics-sfw", label: "🌸 Waifu.pics SFW",    description: "Extra anime SFW from api.waifu.pics",         sources:{ sfw:{ femboy:["https://api.waifu.pics/sfw/waifu", "https://api.waifu.pics/sfw/shinobu"], tomboy:["https://api.waifu.pics/sfw/neko"] } } },
    { id: "waifupics-nsfw",label: "🔞🌸 Waifu.pics NSFW", description: "Anime NSFW from api.waifu.pics",              sources:{ nsfw:{ femboy:["https://api.waifu.pics/nsfw/waifu"], tomboy:["https://api.waifu.pics/nsfw/neko"] } } },
    { id: "nekoslife",     label: "🐱 Nekos.life SFW",    description: "Anime SFW from nekos.life",                   sources:{ sfw:{ femboy:["https://nekos.life/api/v2/img/neko"], tomboy:["https://nekos.life/api/v2/img/neko"] } } }
];

if (!storage.customSources) storage.customSources = { sfw:{ femboy:[], tomboy:[] }, nsfw:{ femboy:[], tomboy:[] } };
if (!storage.enabledPacks)  storage.enabledPacks   = [];
if (storage.redditClientId === undefined) storage.redditClientId = "";

var isImage = function(u) { return /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(u); };
var isVideo = function(u) { return /\.(mp4|webm|gifv|gif)(\?.*)?$/i.test(u); };
var isAny   = function() { return true; };

function buildSources(type, cat) {
    var out = [], def = DEFAULT_SOURCES[cat] && DEFAULT_SOURCES[cat][type];
    if (def) for (var d = 0; d < def.length; d++) out.push(def[d]);
    var pks = storage.enabledPacks || [];
    for (var pi = 0; pi < pks.length; pi++) for (var pp = 0; pp < PRESET_PACKS.length; pp++) {
        if (PRESET_PACKS[pp].id === pks[pi]) {
            var s = PRESET_PACKS[pp].sources && PRESET_PACKS[pp].sources[cat] && PRESET_PACKS[pp].sources[cat][type];
            if (s) for (var si = 0; si < s.length; si++) out.push(s[si]);
        }
    }
    var cu = storage.customSources && storage.customSources[cat] && storage.customSources[cat][type];
    if (cu) for (var ci = 0; ci < cu.length; ci++) out.push(cu[ci]);    return out;
}

function fetchMedia(type, cat, wantVideo) {
    var filter = wantVideo ? isVideo : isImage;
    var sources = shuffle(buildSources(type, cat));
    var log = [];
    if (!sources.length) return Promise.resolve({ url: null, source: null, log: ["no sources configured"] });

    function attempt(idx) {
        if (idx >= sources.length) return Promise.resolve({ url: null, source: null, log: log });
        var src = sources[idx];
        var label = labelFor(src);

        if (src.indexOf("http") === 0) {
            return fetch(cacheBust(src), { headers: { "User-Agent": "RevengePlugin/1.0", "Cache-Control": "no-cache" } })
                .then(function(res) {
                    if (!res.ok) { log.push(label + ": HTTP " + res.status); return attempt(idx + 1); }
                    var ct = res.headers.get("content-type") || "";
                    if (ct.indexOf("image/") > -1 || ct.indexOf("video/") > -1) {
                        if (filter(src)) return { url: src, source: label, log: log };
                        log.push(label + ": wrong media type"); return attempt(idx + 1);
                    }
                    return res.json().then(function(d) {
                        var u = (d.results && d.results[0] && d.results[0].url) ||
                                 d.url || d.file || d.message || d.src || d.image || "";
                        if (u && (filter(u) || u.indexOf("nekos.best") > -1)) return { url: u, source: label, log: log };
                        log.push(label + ": no matching url in response");
                        return attempt(idx + 1);
                    });
                }).catch(function(err) { log.push(label + ": " + (err && err.message || "fetch error")); return attempt(idx + 1); });
        }

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
    if (!recentUrls[key]) recentUrls[key] = [];
    function tryFetch(retries) {
        return fetchMedia(type, cat, wantVideo).then(function(result) {
            if (!result.url) return result;
            if (retries <= 0 || recentUrls[key].indexOf(result.url) === -1) {                recentUrls[key].push(result.url);
                if (recentUrls[key].length > 15) recentUrls[key].shift();
                return result;
            }
            return tryFetch(retries - 1);
        });
    }
    return tryFetch(2);
}

function fetchFromSubreddit(sub, kind) {
    var filter = kind === "video" ? isVideo : kind === "image" ? isImage : isAny;
    var log = [];
    function attempt(i) {
        if (i >= 3) return Promise.resolve({ url: null, log: log });
        return fetchRedditPost(sub, filter, false).then(function(result) {
            if (result.url) return { url: result.url, log: log };
            log.push(result.reason);
            return attempt(i + 1);
        });
    }
    return attempt(0);
}

// ── Settings ─────────────────────────────────────────────────────────────────
exports.settings = function SettingsView() {
    var tabS = React.useState("packs"); var tab = tabS[0]; var setTab = tabS[1];
    var catS = React.useState("sfw");   var cat = catS[0]; var setCat = catS[1];
    var typS = React.useState("femboy");var typ = typS[0]; var setTyp = typS[1];
    var inpS = React.useState("");      var inp = inpS[0]; var setInp = inpS[1];
    var ridS = React.useState(storage.redditClientId || ""); var ridInput = ridS[0]; var setRidInput = ridS[1];
    var statusS = React.useState("");   var status = statusS[0]; var setStatus = statusS[1];
    var tikS = React.useState(0);       var setTik = tikS[1];
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
            Pill("📦 Packs", tab==="packs", function(){setTab("packs");}, 6),
            Pill("✏️ Custom", tab==="custom", function(){setTab("custom");}, 6),
            Pill("🔑 Reddit", tab==="reddit", function(){setTab("reddit");})
        ),
        tab==="packs" && e(V, null,
            e(T, {style:{color:"#aaa",marginBottom:12,fontSize:13}}, "Nekos.best + Waifu.pics always on. Reddit packs need a Client ID (🔑 Reddit tab)."),
            PRESET_PACKS.map(function(pack) {
                var on = epacks.indexOf(pack.id) > -1;
                return e(TO, { key:pack.id, onPress:function() { var i=storage.enabledPacks.indexOf(pack.id); if(i>-1) storage.enabledPacks.splice(i,1); else storage.enabledPacks.push(pack.id); refresh(); },
                    style:{backgroundColor:on? "#1a3a6e" : "#2B2D31",borderRadius:10,padding:14,marginBottom:10,borderWidth:1,borderColor:on? "#5865F2" : "#444"} },
                    e(V, {style:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}},
                        e(T, {style:{color:"#fff",fontWeight:"bold",fontSize:15,flex:1}}, pack.label),
                        e(T, {style:{fontSize:18}}, on? "✅" : "⬜")),
                    e(T, {style:{color:"#aaa",fontSize:12,marginTop:4}}, pack.description));
            })
        ),

        tab==="custom" && e(V, null,
            e(V, {style:{flexDirection:"row",marginBottom:8}},
                Pill("SFW", cat==="sfw", function(){setCat("sfw");}, 8),
                Pill("NSFW", cat==="nsfw", function(){setCat("nsfw");})),
            e(V, {style:{flexDirection:"row",marginBottom:12}},
                Pill("Femboy", typ==="femboy", function(){setTyp("femboy");}, 8),
                Pill("Tomboy", typ==="tomboy", function(){setTyp("tomboy");})),
            e(T, {style:{color:"#aaa",fontSize:12,marginBottom:8}}, "Subreddit name (no r/) OR full URL — subreddits need a Reddit Client ID set"),
            e(TI, { style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:8},
                placeholder:"subreddit or https://...", placeholderTextColor:"#555",
                value:inp, onChangeText:setInp, autoCapitalize:"none", autoCorrect:false }),
            e(TO, { onPress:function() { var v=inp.trim(); if(!v||custom.indexOf(v)>-1) return; storage.customSources[cat][typ].push(v); setInp(""); refresh(); },
                style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center",marginBottom:20} },
                e(T, {style:{color:"#fff",fontWeight:"bold"}}, "+ Add Source")),
            e(T, {style:{color:"#fff",fontWeight:"bold",marginBottom:8}}, "Your sources — "+cat.toUpperCase()+" / "+typ+":"),
            custom.length===0
                ? e(T, {style:{color:"#555",fontStyle:"italic"}}, "None yet.")
                : custom.map(function(src, idx) {
                    return e(V, {key:idx, style:{flexDirection:"row",alignItems:"center",backgroundColor:"#2B2D31",padding:10,borderRadius:8,marginBottom:8}},
                        e(T, {style:{color:"#ddd",flex:1,marginRight:8}, numberOfLines:1}, src),
                        e(TO, {onPress:function(){storage.customSources[cat][typ].splice(idx,1);refresh();}},
                             e(T, {style:{color:"#ff5555",fontWeight:"bold",fontSize:16}}, "✕")));
                })
        ),

        tab==="reddit" && e(V, null,
            e(T, {style:{color:"#fff",fontWeight:"bold",fontSize:15,marginBottom:10}}, "Reddit OAuth Setup"),
            e(T, {style:{color:"#aaa",fontSize:12,marginBottom:14,lineHeight:18}},
                 "1. Open reddit.com/prefs/apps in your browser\n2. Tap 'create another app...'\n3. Type: select 'installed app'\n4. Redirect URI: anything, e.g. http://localhost\n5. Copy the string under the app name — that's your Client ID"
            ),
            e(TI, { style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:10},
                placeholder:"Paste your Reddit Client ID here", placeholderTextColor:"#555",
                value:ridInput, onChangeText:setRidInput, autoCapitalize:"none", autoCorrect:false }),
            e(TO, { onPress:function() {
                    storage.redditClientId = ridInput.trim();
                    storage.redditToken = null; storage.redditTokenExpiry = null;
                    setStatus("💾 Saved! Tap Test Connection below.");                },
                style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center",marginBottom:10} },
                e(T, {style:{color:"#fff",fontWeight:"bold"}}, "Save Client ID")),
            e(TO, { onPress:function() {
                    setStatus("⏳ Testing...");
                    storage.redditToken = null; storage.redditTokenExpiry = null;
                    getRedditToken().then(function(token) {
                        setStatus(token ? "✅ Connected! Reddit OAuth is working." : "❌ Failed. Double-check your Client ID.");
                    });
                },
                style:{backgroundColor:"#2B2D31",padding:12,borderRadius:8,alignItems:"center",borderWidth:1,borderColor:"#444",marginBottom:14} },
                e(T, {style:{color:"#fff",fontWeight:"bold"}}, "Test Connection")),
            status ? e(T, {style:{color:"#ddd",fontSize:13}}, status) : null
        )
    );
};

// ── onLoad ────────────────────────────────────────────────────────────────────
var unregFns = [];
var activeGuesses = {};

exports.onLoad = function() {
    var registerCommand = vendetta.commands.registerCommand;

    unregFns.push(registerCommand({
        name: "ftest", untranslatedName: "ftest",
        description: "Debug: proves plugin works",
        execute: function(args, ctx) { send(getChannelId(ctx), "✅ Plugin is working!"); }
    }));

    unregFns.push(registerCommand({
        name: "nettest", untranslatedName: "nettest",
        description: "Debug: checks which image-source domains your network can reach",
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            sendPrivate(cid, "⏳ Testing domains, results coming one by one...");
            var domains = [
                ["api.waifu.pics", "https://api.waifu.pics/sfw/waifu"],
                ["nekos.best", "https://nekos.best/api/v2/neko"],
                ["nekos.life", "https://nekos.life/api/v2/img/neko"],
                ["oauth.reddit.com (needs token)", "https://oauth.reddit.com/r/aww/hot?limit=1"]
            ];
            domains.forEach(function(pair) {
                var label = pair[0], url = pair[1];
                var timedOut = false;
                var timer = setTimeout(function() {
                    timedOut = true;
                    sendPrivate(cid, "⏱️ " + label + ": timed out (8s)");
                }, 8000);
                fetch(cacheBust(url), { headers: { "User-Agent": "RevengePlugin/1.0" } })
                    .then(function(r) {
                        if (timedOut) return;
                        clearTimeout(timer);
                        sendPrivate(cid, "✅ " + label + ": reachable (HTTP " + r.status + ")");
                    })
                    .catch(function(err) {
                        if (timedOut) return;
                        clearTimeout(timer);
                        sendPrivate(cid, "❌ " + label + ": " + (err && err.message || "failed"));
                    });
            });
        }
    }));

    // ── NEW COMMAND: Find Subreddits ──────────────────────────────────────────
    unregFns.push(registerCommand({
        name: "findsubs", untranslatedName: "findsubs",
        description: "Search Reddit for subreddits matching a query",
        options: [{
            name: "query", displayName: "query", description: "Search term (e.g., femboy, tomboy)",
            type: 3, required: true
        }],
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            var query = (args && args[0] && args[0].value) || "";
            if (!query) { sendPrivate(cid, "❌ Please provide a search query."); return; }
            
            sendPrivate(cid, "🔍 Searching Reddit for: `" + query + "`...");
            searchRedditSubreddits(query).then(function(res) {
                if (res.reason) { sendPrivate(cid, "❌ Error: " + res.reason); return; }
                if (!res.subs.length) { sendPrivate(cid, "❌ No subreddits found for `" + query + "`."); return; }
                
                var msg = "✅ **Found Subreddits:**\n";
                res.subs.forEach(function(s) {
                    msg += "• **r/" + s.name + "** (" + s.subs.toLocaleString() + " members)\n";
                });
                msg += "\n*Tip: Use `/fromsub subreddit:" + res.subs[0].name + "` to fetch from them!*";
                sendPrivate(cid, msg);
            });
        }
    }));

    // ── NEW COMMAND: Fetch from Booru/Galleries ───────────────────────────────
    unregFns.push(registerCommand({
        name: "frombooru", untranslatedName: "frombooru",
        description: "Fetch media from Booru-style image galleries (Safebooru/Rule34)",
        options: [
            { name: "tags", displayName: "tags", description: "Tags to search (space separated, use _ for spaces)", type: 3, required: true },
            { name: "site", displayName: "site", description: "Gallery site to use", type: 3, required: false,
                choices: [
                    { name: "safebooru (SFW)", displayName: "safebooru (SFW)", value: "safebooru" },
                    { name: "rule34 (NSFW)", displayName: "rule34 (NSFW)", value: "rule34" }
                ]
            }
        ],
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            var tags = (args && args[0] && args[0].value) || "";
            var site = (args && args[1] && args[1].value) || "safebooru";
            var isNsfw = site === "rule34";
            
            if (!tags) { sendPrivate(cid, "❌ Please provide tags to search."); return; }
            
            sendPrivate(cid, "🖼️ Fetching from " + site + " with tags: `" + tags + "`...");
            fetchFromBooru(site, tags, isNsfw).then(function(result) {
                if (result.url) { 
                    send(cid, result.url); 
                    sendPrivate(cid, "📍 Source: " + result.source); 
                } else { 
                    sendPrivate(cid, "❌ Nothing found.\n\nDebug: " + result.reason); 
                }
            });
        }
    }));

    // ── NEW COMMAND: Check Sources Health ─────────────────────────────────────
    unregFns.push(registerCommand({
        name: "checksources", untranslatedName: "checksources",
        description: "Test all configured API and Reddit sources to see if they are online",
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            sendPrivate(cid, "🔧 Testing all configured sources... (This may take a few seconds)");
            
            var sources = [];
            // Add default/pack/custom HTTP sources
            ["sfw", "nsfw"].forEach(function(cat) {
                ["femboy", "tomboy"].forEach(function(type) {
                    var built = buildSources(type, cat);
                    built.forEach(function(src) {
                        if (src.indexOf("http") === 0 && sources.indexOf(src) === -1) sources.push(src);
                    });
                });
            });

            if (!sources.length) {
                sendPrivate(cid, "❌ No HTTP/API sources configured to test.");
                return;
            }

            var results = [];
            var completed = 0;
            
            sources.forEach(function(src) {
                var label = labelFor(src);
                fetch(cacheBust(src), { method: "GET", headers: { "User-Agent": "RevengePlugin/1.0" } })
                    .then(function(res) {
                        results.push("✅ **" + label + "** (HTTP " + res.status + ")");
                    })
                    .catch(function(err) {
                        results.push("❌ **" + label + "** (" + (err.message || "Offline") + ")");
                    })
                    .finally(function() {
                        completed++;
                        if (completed === sources.length) {
                            sendPrivate(cid, "📊 **Source Health Check Complete:**\n\n" + results.join("\n"));
                        }
                    });
            });
        }
    }));

    var combos = [["femboy", "sfw"],["femboy", "nsfw"],["tomboy", "sfw"],["tomboy", "nsfw"]];
    combos.forEach(function(pair) {
        var type = pair[0], cat = pair[1], name = cat==="nsfw" ? "nsfw_"+type : type;

        unregFns.push(registerCommand({
            name: name, untranslatedName: name,
            description: "Send a "+cat.toUpperCase()+" "+type+" image",
            execute: function(args, ctx) {
                var cid = getChannelId(ctx);
                fetchMediaDedup(type, cat, false).then(function(result) {
                    if (result.url) { send(cid, result.url); sendPrivate(cid, "📍 Source: " + result.source); }
                    else sendPrivate(cid, "❌ All sources failed.\n\nDebug:\n" + result.log.slice(0, 8).join("\n"));
                });
            }
        }));

        unregFns.push(registerCommand({
            name: name+"_video", untranslatedName: name+"_video",
            description: "Send a "+cat.toUpperCase()+" "+type+" video/gif",
            execute: function(args, ctx) {
                var cid = getChannelId(ctx);
                fetchMediaDedup(type, cat, true).then(function(result) {
                    if (result.url) { send(cid, result.url); sendPrivate(cid, "📍 Source: " + result.source); }
                    else sendPrivate(cid, "❌ No video/gif found.\n\nDebug:\n" + result.log.slice(0, 8).join("\n"));
                });
            }
        }));
    });

    unregFns.push(registerCommand({
        name: "fromsub", untranslatedName: "fromsub",
        description: "Pull media directly from a specific subreddit",
        options: [
            { name: "subreddit", displayName: "subreddit", description: "e.g. femboyfun (no r/)", type:3, required:true },
            { name: "kind", displayName: "kind", description: "Type of media", type:3, required:false,
                choices:[
                    { name: "image", displayName: "image", value: "image" },
                    { name: "video/gif", displayName: "video/gif", value: "video" },
                    { name: "any", displayName: "any", value: "any" }
                ]
            }
        ],
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            var sub  = (args && args[0] && args[0].value || "").replace(/^r\//i, "").trim();
            var kind = (args && args[1] && args[1].value) || "any";
            if (!sub) { sendPrivate(cid, "❌ You need to give a subreddit name."); return; }
            fetchFromSubreddit(sub, kind).then(function(result) {
                if (result.url) { send(cid, result.url); sendPrivate(cid, "📍 Source: r/" + sub + " (reddit.com OAuth)"); }
                else sendPrivate(cid, "❌ Nothing found on r/" + sub + " matching '" + kind + "'.\n\nDebug:\n" + result.log.slice(0, 5).join("\n"));
            });
        }
    }));

    unregFns.push(registerCommand({
        name: "guess", untranslatedName: "guess",
        description: "Start a Femboy or Tomboy guessing game",
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            var type = Math.random() > 0.5 ? "femboy" : "tomboy";
            fetchMediaDedup(type, "sfw", false).then(function(result) {
                if (!result.url) { sendPrivate(cid, "❌ Fetch failed.\n\nDebug:\n" + result.log.slice(0, 8).join("\n")); return; }
                activeGuesses[cid] = type;
                send(cid, "📸 **Femboy or Tomboy?**\nUse `/answer` to submit your guess!\n\n" + result.url);
            });
        }
    }));

    unregFns.push(registerCommand({
        name: "answer", untranslatedName: "answer",
        description: "Submit your guess for the current /guess game",
        options: [{
            name: "choice", displayName: "choice", description: "Your guess",
            type:3, required:true,
            choices:[
                { name: "femboy", displayName: "femboy", value: "femboy" },
                { name: "tomboy", displayName: "tomboy", value: "tomboy" }
            ]
        }],
        execute: function(args, ctx) {
            var cid = getChannelId(ctx), correct = activeGuesses[cid];
            if (!correct) { sendPrivate(cid, "❌ No active game. Use /guess to start one."); return; }
            var guess = args && args[0] && args[0].value, won = guess === correct;
            send(cid, won ? "✅ **Correct!** It was a **"+correct+"**!" : "❌ **Wrong!** It was a **"+correct+"**, not a "+guess+"!");
            delete activeGuesses[cid];
        }
    }));
};

exports.onUnload = function() {
    for (var i = 0; i < unregFns.length; i++) try { unregFns[i](); } catch(e) {}
    unregFns = [];
    activeGuesses = {};
    recentUrls = {};
};

return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
