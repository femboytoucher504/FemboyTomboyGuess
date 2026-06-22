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
    return "r/" + src;
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
var isImage = function(u) { return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u); };
var isVideo = function(u) { return /\.(mp4|webm|gifv|mov)(\?.*)?$/i.test(u); };
var isAny = function() { return true; };

// Public Reddit JSON endpoint - no OAuth, but Reddit increasingly blocks
// requests coming from VPN / datacenter IP ranges with a plain 403.
// There's no reliable code-side fix for that; we just log it and move on
// to the next source instead of failing the whole command.
function fetchRedditPublic(sub, filterFn) {
    var url = "https://www.reddit.com/r/" + sub + "/hot.json?limit=100";
    return fetch(cacheBust(url), { headers: { "User-Agent": REDDIT_UA } })
        .then(function(res) {
            if (!res.ok) return { url: null, reason: "HTTP " + res.status };
            return res.json().then(function(json) {
                var posts = (json && json.data && json.data.children) || [];
                var candidates = [];
                for (var i = 0; i < posts.length; i++) {
                    var d = posts[i] && posts[i].data;
                    if (!d || !d.url || d.is_video || d.over_18) continue;
                    if (filterFn(d.url)) candidates.push(d.url);
                }
                if (!candidates.length) return { url: null, reason: "no posts" };
                return { url: candidates[Math.floor(Math.random() * candidates.length)], reason: null };
            });
        }).catch(function(err) { return { url: null, reason: err.message || "error" }; });
}

// Generic fetcher for any custom HTTP image-API source the user adds in
// Settings. Handles plain {url}/{file}/{message}/{src}/{image} shapes AND
// {results:[{url}]} shapes (e.g. nekos.best) - this was the actual bug
// that made nekos.best return HTTP 200 but "no url".
function fetchGenericSource(src, filterFn) {
    return fetch(cacheBust(src), { headers: { "User-Agent": "RevengeImageBot/1.0" } })
        .then(function(res) {
            if (!res.ok) return { url: null, reason: "HTTP " + res.status };
            var ct = res.headers.get("content-type") || "";
            if (ct.indexOf("image/") > -1 || ct.indexOf("video/") > -1) {
                return filterFn(src) ? { url: src, reason: null } : { url: null, reason: "wrong type" };
            }
            return res.json().then(function(d) {
                var u = d.url || d.file || d.message || d.src || d.image || "";
                if (!u && d.results && d.results.length && d.results[0] && d.results[0].url) u = d.results[0].url;
                if (u && filterFn(u)) return { url: u, reason: null };
                return { url: null, reason: "no usable url" };
            });
        }).catch(function(err) { return { url: null, reason: err.message || "error" }; });
}

if (!storage.customSources) storage.customSources = { femboy: [], tomboy: [] };
if (!storage.customSources.femboy) storage.customSources.femboy = [];
if (!storage.customSources.tomboy) storage.customSources.tomboy = [];

var DEFAULT_SOURCES = {
    femboy: ["femboymemes", "MildFemboys", "feminineboys"],
    tomboy: ["tomboy", "tomboys"]
};

function buildSources(type) {
    var out = DEFAULT_SOURCES[type] ? DEFAULT_SOURCES[type].slice() : [];
    var custom = storage.customSources[type] || [];
    for (var i = 0; i < custom.length; i++) out.push(custom[i]);
    return out;
}

function fetchMedia(type, wantVideo) {
    var filter = wantVideo ? isVideo : isImage;
    var sources = shuffle(buildSources(type));
    var log = [];
    if (!sources.length) return Promise.resolve({ url: null, source: null, log: ["No sources configured for " + type] });

    function attempt(idx) {
        if (idx >= sources.length) return Promise.resolve({ url: null, source: null, log: log });
        var src = sources[idx];
        var label = labelFor(src);
        var p = src.indexOf("http") === 0 ? fetchGenericSource(src, filter) : fetchRedditPublic(src, filter);
        return p.then(function(result) {
            if (result.url) return { url: result.url, source: label, log: log };
            log.push(label + ": " + (result.reason || "failed"));
            return attempt(idx + 1);
        });
    }
    return attempt(0);
}

var recentUrls = {};
function fetchMediaDedup(type, wantVideo) {
    var key = type + ":" + (wantVideo ? "v" : "i");
    if (!recentUrls[key]) recentUrls[key] = [];
    function tryFetch(retries) {
        return fetchMedia(type, wantVideo).then(function(result) {
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

function fetchFromSubreddit(sub, kind) {
    var filter = kind === "video" ? isVideo : kind === "image" ? isImage : isAny;
    var log = [];
    function attempt(i) {
        if (i >= 3) return Promise.resolve({ url: null, log: log });
        return fetchRedditPublic(sub, filter).then(function(result) {
            if (result.url) return { url: result.url, log: log };
            log.push(result.reason);
            return attempt(i + 1);
        });
    }
    return attempt(0);
}

// ── Settings ─────────────────────────────────────────────────────────────────
exports.settings = function SettingsView() {
    var typS = React.useState("femboy"); var typ = typS[0]; var setTyp = typS[1];
    var inpS = React.useState(""); var inp = inpS[0]; var setInp = inpS[1];
    var tikS = React.useState(0); var setTik = tikS[1];
    var refresh = function() { setTik(function(t) { return t + 1; }); };
    var custom = storage.customSources[typ] || [];
    var e = React.createElement, SV = RN.ScrollView, V = RN.View, T = RN.Text, TI = RN.TextInput, TO = RN.TouchableOpacity;

    function Pill(label, active, fn, mr) {
        return e(TO, { onPress: fn, style: { flex:1, padding:9, backgroundColor:active? "#5865F2" : "#2B2D31", borderRadius:8, alignItems:"center", marginRight:mr||0 } },
            e(T, { style: { color: "#fff", fontWeight: "bold", fontSize:13 } }, label));
    }

    return e(SV, { style:{flex:1}, contentContainerStyle:{padding:16} },
        e(V, { style:{flexDirection:"row",marginBottom:16} },
            Pill("Femboy", typ==="femboy", function(){setTyp("femboy");}, 8),
            Pill("Tomboy", typ==="tomboy", function(){setTyp("tomboy");})
        ),
        e(T, {style:{color:"#aaa",fontSize:12,marginBottom:10}}, "Default subreddits: " + DEFAULT_SOURCES[typ].join(", ")),
        e(T, {style:{color:"#aaa",fontSize:12,marginBottom:8}}, "Add a subreddit name OR a full image-API URL"),
        e(TI, { style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:8},
            placeholder:"subreddit or https://...", placeholderTextColor:"#555",
            value:inp, onChangeText:setInp, autoCapitalize:"none", autoCorrect:false }),
        e(TO, { onPress:function() { var v=inp.trim(); if(!v||custom.indexOf(v)>-1) return; storage.customSources[typ].push(v); setInp(""); refresh(); },
            style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center",marginBottom:20} },
            e(T, {style:{color:"#fff",fontWeight:"bold"}}, "+ Add Source")),
        e(T, {style:{color:"#fff",fontWeight:"bold",marginBottom:8}}, "Your custom " + typ + " sources:"),
        custom.length===0 ? e(T, {style:{color:"#555",fontStyle:"italic"}}, "None yet.") :
            custom.map(function(src, idx) {
                return e(V, {key:idx, style:{flexDirection:"row",alignItems:"center",backgroundColor:"#2B2D31",padding:10,borderRadius:8,marginBottom:8}},
                    e(T, {style:{color:"#ddd",flex:1,marginRight:8}, numberOfLines:1}, src),
                    e(TO, {onPress:function(){storage.customSources[typ].splice(idx,1);refresh();}}, e(T, {style:{color:"#ff5555",fontWeight:"bold",fontSize:16}}, "X")));
            })
    );
};

// ── onLoad ────────────────────────────────────────────────────────────────────
var unregFns = [];
var activeGuesses = {};

exports.onLoad = function() {
    var registerCommand = vendetta.commands.registerCommand;

    unregFns.push(registerCommand({
        name: "findsubs", untranslatedName: "findsubs",
        description: "Search Reddit for subreddits",
        options: [{ name: "query", displayName: "query", description: "Search term", type: 3, required: true }],
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            var query = (args && args[0] && args[0].value) || "";
            if (!query) { sendPrivate(cid, "Provide a query"); return; }
            sendPrivate(cid, "Searching Reddit for: " + query);
            var url = "https://www.reddit.com/subreddits/search.json?q=" + encodeURIComponent(query) + "&limit=10";
            fetch(cacheBust(url), { headers: { "User-Agent": REDDIT_UA } })
                .then(function(res) { return res.json(); })
                .then(function(json) {
                    var children = (json && json.data && json.data.children) || [];
                    if (!children.length) { sendPrivate(cid, "No subreddits found."); return; }
                    var msg = "Found Subreddits:\n";
                    children.forEach(function(c) { msg += "r/" + c.data.display_name + " (" + c.data.subscribers.toLocaleString() + " members)\n"; });
                    sendPrivate(cid, msg);
                }).catch(function(err) { sendPrivate(cid, "Error: " + err.message); });
        }
    }));

    unregFns.push(registerCommand({
        name: "checksources", untranslatedName: "checksources",
        description: "Test all configured sources",
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            sendPrivate(cid, "Testing sources...");
            var sources = [];
            ["femboy", "tomboy"].forEach(function(type) {
                buildSources(type).forEach(function(src) { if (sources.indexOf(src) === -1) sources.push(src); });
            });
            if (!sources.length) { sendPrivate(cid, "No sources configured."); return; }
            var results = [], completed = 0;
            sources.forEach(function(src) {
                var label = labelFor(src);
                var url = src.indexOf("http") === 0 ? src : "https://www.reddit.com/r/" + src + "/hot.json?limit=1";
                fetch(cacheBust(url), { headers: { "User-Agent": REDDIT_UA } })
                    .then(function(res) { results.push(label + " (HTTP " + res.status + ")"); })
                    .catch(function(err) { results.push(label + " (" + err.message + ")"); })
                    .finally(function() { completed++; if (completed === sources.length) sendPrivate(cid, "Check Complete:\n\n" + results.join("\n")); });
            });
        }
    }));

    ["femboy", "tomboy"].forEach(function(type) {
        unregFns.push(registerCommand({
            name: type, untranslatedName: type, description: "Send a random " + type + " picture",
            execute: function(args, ctx) {
                var cid = getChannelId(ctx);
                fetchMediaDedup(type, false).then(function(result) {
                    if (result.url) { send(cid, result.url); sendPrivate(cid, "Source: " + result.source); }
                    else sendPrivate(cid, "All sources failed.\nDebug:\n" + result.log.slice(0, 8).join("\n"));
                });
            }
        }));
        unregFns.push(registerCommand({
            name: type + "_video", untranslatedName: type + "_video", description: "Send a random " + type + " video/gif",
            execute: function(args, ctx) {
                var cid = getChannelId(ctx);
                fetchMediaDedup(type, true).then(function(result) {
                    if (result.url) { send(cid, result.url); sendPrivate(cid, "Source: " + result.source); }
                    else sendPrivate(cid, "No video found.\nDebug:\n" + result.log.slice(0, 8).join("\n"));
                });
            }
        }));
    });

    unregFns.push(registerCommand({
        name: "fromsub", untranslatedName: "fromsub",
        description: "Pull an image from any specific subreddit",
        options: [
            { name: "subreddit", displayName: "subreddit", description: "e.g. cats", type:3, required:true },
            { name: "kind", displayName: "kind", description: "Type", type:3, required:false,
                choices:[ { name: "image", value: "image" }, { name: "video", value: "video" }, { name: "any", value: "any" } ] }
        ],
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            var sub = (args && args[0] && args[0].value || "").replace(/^r\//i, "").trim();
            var kind = (args && args[1] && args[1].value) || "any";
            if (!sub) { sendPrivate(cid, "Give a subreddit"); return; }
            fetchFromSubreddit(sub, kind).then(function(result) {
                if (result.url) { send(cid, result.url); sendPrivate(cid, "Source: r/" + sub); }
                else sendPrivate(cid, "Nothing found on r/" + sub + "\n" + result.log.slice(0,5).join("\n"));
            });
        }
    }));

    unregFns.push(registerCommand({
        name: "guess", untranslatedName: "guess", description: "Start a femboy-or-tomboy guessing game",
        execute: function(args, ctx) {
            var cid = getChannelId(ctx);
            var type = Math.random() > 0.5 ? "femboy" : "tomboy";
            fetchMediaDedup(type, false).then(function(result) {
                if (!result.url) { sendPrivate(cid, "Fetch failed, try again."); return; }
                activeGuesses[cid] = type;
                send(cid, "Femboy or Tomboy?\nUse /answer to guess\n\n" + result.url);
            });
        }
    }));

    unregFns.push(registerCommand({
        name: "answer", untranslatedName: "answer", description: "Submit your guess",
        options: [{ name: "choice", displayName: "choice", description: "Guess", type:3, required:true,
            choices:[ { name: "femboy", value: "femboy" }, { name: "tomboy", value: "tomboy" } ] }],
        execute: function(args, ctx) {
            var cid = getChannelId(ctx), correct = activeGuesses[cid];
            if (!correct) { sendPrivate(cid, "No active game. Use /guess to start one."); return; }
            var guess = args && args[0] && args[0].value, won = guess === correct;
            send(cid, won ? "Correct! It was " + correct + "!" : "Wrong! It was " + correct + "!");
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
                
