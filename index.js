(function(exports, patcher, metro, storage) {
"use strict";
var React = metro.findByProps("createElement", "useState");
var RN = metro.findByProps("ScrollView", "TextInput", "TouchableOpacity");
var MA = metro.findByProps("sendMessage", "sendBotMessage");
var ChannelStore = metro.findByProps("getLastSelectedChannelId");

// ── Optional: bake in a default Cloudflare Worker proxy URL ─────────────────
// Deploy the included cloudflare-worker.js, then paste its URL below (e.g.
// "https://reddit-proxy.yourname.workers.dev"). Every install of this plugin
// will then automatically fall back to it if a direct Reddit request fails
// (typically only an issue for people on a VPN). People NOT on a VPN never
// touch this path at all - direct requests are always tried first.
// Leave it as "" if you don't want a shared default; people can still set
// their own in Settings -> Proxy.
var BAKED_IN_PROXY_URL = "https://femboytoucher.ahmemuhsins3169.workers.dev/";

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

if (!storage.customSources) storage.customSources = { femboy: [], tomboy: [] };
if (!storage.customSources.femboy) storage.customSources.femboy = [];
if (!storage.customSources.tomboy) storage.customSources.tomboy = [];
if (!storage.enabledPacks) storage.enabledPacks = [];
if (typeof storage.proxyUrl !== "string") storage.proxyUrl = "";

// Per-device override (Settings -> Proxy) wins if set, otherwise fall back
// to whatever's baked into the code above. Either way this is ONLY used
// as a fallback after a direct request already failed - see fetchRedditRaw.
function effectiveProxyUrl() {
    if (storage.proxyUrl && storage.proxyUrl.trim()) return storage.proxyUrl.trim();
    if (BAKED_IN_PROXY_URL && BAKED_IN_PROXY_URL.trim()) return BAKED_IN_PROXY_URL.trim();
    return "";
}

// Always tries reddit.com directly first (works fine for most people - the
// 403 issue is specific to VPN/datacenter IPs). Only retries through the
// proxy if the direct attempt failed outright or came back non-200.
function fetchRedditRaw(target) {
    return fetch(cacheBust(target), { headers: { "User-Agent": REDDIT_UA } })
        .then(function(res) {
            if (res.ok) return { res: res, viaProxy: false };
            return maybeRetryViaProxy(target);
        })
        .catch(function() { return maybeRetryViaProxy(target); });
}

function maybeRetryViaProxy(target) {
    var proxy = effectiveProxyUrl();
    if (!proxy) return fetch(cacheBust(target), { headers: { "User-Agent": REDDIT_UA } }).then(function(res) { return { res: res, viaProxy: false }; });
    var proxied = proxy.replace(/\/$/, "") + "?url=" + encodeURIComponent(target);
    return fetch(cacheBust(proxied), { headers: { "User-Agent": REDDIT_UA } }).then(function(res) { return { res: res, viaProxy: true }; });
}

function fetchRedditPublic(sub, filterFn) {
    var target = "https://www.reddit.com/r/" + sub + "/hot.json?limit=100";
    return fetchRedditRaw(target).then(function(wrap) {
        var res = wrap.res;
        if (!res.ok) return { url: null, reason: "HTTP " + res.status + (wrap.viaProxy ? " (proxy)" : "") };
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
// Settings, or a Pack. Handles plain {url}/{file}/{message}/{src}/{image}
// shapes AND {results:[{url}]} shapes (e.g. nekos.best). Not routed through
// the Reddit proxy - it's only allowlisted for reddit.com.
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

var DEFAULT_SOURCES = {
    femboy: ["femboymemes", "MildFemboys", "feminineboys"],
    tomboy: ["tomboy", "tomboys"]
};

// Optional toggle-able bundles, off by default. Kept deliberately small -
// only includes sources verified to actually return HTTP 200, rather than
// guessing at subreddit names that might be dead, renamed, or not what
// they sound like.
var PRESET_PACKS = [
    {
        id: "nekos-anime",
        label: "Nekos.best (anime filler)",
        description: "Generic cute anime images, not femboy/tomboy-specific. Useful as bonus variety or as a fallback when Reddit is unreachable.",
        sources: { femboy: ["https://nekos.best/api/v2/husbando"], tomboy: ["https://nekos.best/api/v2/neko"] }
    }
];

function buildSources(type) {
    var out = DEFAULT_SOURCES[type] ? DEFAULT_SOURCES[type].slice() : [];
    var packs = storage.enabledPacks || [];
    for (var p = 0; p < packs.length; p++) {
        for (var pp = 0; pp < PRESET_PACKS.length; pp++) {
            if (PRESET_PACKS[pp].id === packs[p]) {
                var s = PRESET_PACKS[pp].sources[type];
                if (s) for (var si = 0; si < s.length; si++) out.push(s[si]);
            }
        }
    }
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
    var tabS = React.useState("sources"); var tab = tabS[0]; var setTab = tabS[1];
    var typS = React.useState("femboy"); var typ = typS[0]; var setTyp = typS[1];
    var inpS = React.useState(""); var inp = inpS[0]; var setInp = inpS[1];
    var proxS = React.useState(storage.proxyUrl || ""); var proxInp = proxS[0]; var setProxInp = proxS[1];
    var tikS = React.useState(0); var setTik = tikS[1];
    var refresh = function() { setTik(function(t) { return t + 1; }); };
    var custom = storage.customSources[typ] || [];
    var epacks = storage.enabledPacks || [];
    var e = React.createElement, SV = RN.ScrollView, V = RN.View, T = RN.Text, TI = RN.TextInput, TO = RN.TouchableOpacity;

    function Pill(label, active, fn, mr) {
        return e(TO, { onPress: fn, style: { flex:1, padding:9, backgroundColor:active? "#5865F2" : "#2B2D31", borderRadius:8, alignItems:"center", marginRight:mr||0 } },
            e(T, { style: { color: "#fff", fontWeight: "bold", fontSize:13 } }, label));
    }

    return e(SV, { style:{flex:1}, contentContainerStyle:{padding:16} },
        e(V, { style:{flexDirection:"row",marginBottom:16} },
            Pill("Sources", tab==="sources", function(){setTab("sources");}, 6),
            Pill("Packs", tab==="packs", function(){setTab("packs");}, 6),
            Pill("Proxy", tab==="proxy", function(){setTab("proxy");})
        ),

        tab==="sources" && e(V, null,
            e(V, { style:{flexDirection:"row",marginBottom:12} },
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
                }),
            e(T, {style:{color:"#555",fontSize:11,marginTop:16,fontStyle:"italic"}}, "Note: sources added here only apply on this device. To change defaults for everyone who installs the plugin, edit DEFAULT_SOURCES in index.js on GitHub.")
        ),

        tab==="packs" && e(V, null,
            e(T, {style:{color:"#aaa",marginBottom:12,fontSize:13}}, "Optional bonus source bundles. Off by default."),
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

        tab==="proxy" && e(V, null,
            e(T, {style:{color:"#aaa",fontSize:13,marginBottom:10}}, "Reddit is always tried directly first - this only kicks in automatically as a fallback if that fails (common on VPNs). Most people won't need to touch this."),
            e(T, {style:{color:"#aaa",fontSize:12,marginBottom:10}}, "Plugin-wide default: " + (BAKED_IN_PROXY_URL ? BAKED_IN_PROXY_URL : "(none set by the plugin author)")),
            e(TI, { style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:8},
                placeholder:"override: https://your-worker.workers.dev", placeholderTextColor:"#555",
                value:proxInp, onChangeText:setProxInp, autoCapitalize:"none", autoCorrect:false }),
            e(TO, { onPress:function() { storage.proxyUrl = proxInp.trim(); refresh(); },
                style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center"} },
                e(T, {style:{color:"#fff",fontWeight:"bold"}}, "Save Override")),
            e(T, {style:{color:"#8f8",fontSize:12,marginTop:10}}, "Currently effective: " + (effectiveProxyUrl() || "(direct only, no fallback configured)"))
        )
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
            var target = "https://www.reddit.com/subreddits/search.json?q=" + encodeURIComponent(query) + "&limit=10";
            fetchRedditRaw(target).then(function(wrap) { return wrap.res.json(); })
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
                if (src.indexOf("http") === 0) {
                    fetch(cacheBust(src), { method: "GET" })
                        .then(function(res) { results.push(label + " (HTTP " + res.status + ")"); })
                        .catch(function(err) { results.push(label + " (" + err.message + ")"); })
                        .finally(function() { completed++; if (completed === sources.length) sendPrivate(cid, "Check Complete:\n\n" + results.join("\n")); });
                } else {
                    fetchRedditRaw("https://www.reddit.com/r/" + src + "/hot.json?limit=1")
                        .then(function(wrap) { results.push(label + " (HTTP " + wrap.res.status + (wrap.viaProxy ? ", via proxy" : "") + ")"); })
                        .catch(function(err) { results.push(label + " (" + err.message + ")"); })
                        .finally(function() { completed++; if (completed === sources.length) sendPrivate(cid, "Check Complete:\n\n" + results.join("\n")); });
                }
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
