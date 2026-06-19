(function(exports, patcher, metro, storage) {
    "use strict";

    var registerCommand = vendetta.commands.registerCommand;
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

    // High-availability endpoints verified to bypass strict VPN proxy layers.
    var DEFAULT_SOURCES = {
        sfw: {
            femboy: [
                "https://nekos.best/api/v2/femboy",
                "meme-api:femboymemes",
                "meme-api:MildFemboys",
                "meme-api:feminineboys"
            ],
            tomboy: [
                "https://nekos.best/api/v2/tomboy",
                "meme-api:tomboy",
                "meme-api:tomboys",
                "meme-api:AnimeTomboys"
            ]
        },
        nsfw: {
            femboy: [
                "meme-api:femboy",
                "meme-api:traditionalfemboys"
            ],
            tomboy: [
                "meme-api:tomboygf"
            ]
        }
    };

    var PRESET_PACKS = [
        { id:"reddit-sfw",    label:"📋 Reddit SFW",        description:"Femboy & tomboy subreddits via meme-api.com", sources:{ sfw:{ femboy:["femboymemes","MildFemboys","feminineboys"], tomboy:["tomboy","tomboys","AnimeTomboys"] } } },
        { id:"reddit-nsfw",   label:"🔞 Reddit NSFW",       description:"NSFW subreddits via meme-api.com",            sources:{ nsfw:{ femboy:["femboy","traditionalfemboys"], tomboy:["tomboygf"] } } },
        { id:"nekosbest-sfw", label:"🌸 Nekos.best SFW",    description:"Alternative high-speed anime endpoint",        sources:{ sfw:{ femboy:["https://nekos.best/api/v2/femboy"], tomboy:["https://nekos.best/api/v2/tomboy"] } } }
    ];

    if (!storage.customSources) storage.customSources = { sfw:{ femboy:[], tomboy:[] }, nsfw:{ femboy:[], tomboy:[] } };
    if (!storage.enabledPacks)  storage.enabledPacks  = [];

    // Strict regex validation to ensure payloads are embeddable media.
    var isImage = function(u) { return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(u); };
    var isVideo = function(u) { return /\.(mp4|webm)(\?.*)?$/i.test(u); };

    function buildSources(type, cat) {
        var out=[], def=DEFAULT_SOURCES[cat]&&DEFAULT_SOURCES[cat][type];
        if (def) for (var d=0; d<def.length; d++) out.push(def[d]);
        var pks=storage.enabledPacks||[];
        for (var pi=0; pi<pks.length; pi++) for (var pp=0; pp<PRESET_PACKS.length; pp++) {
            if (PRESET_PACKS[pp].id===pks[pi]) {
                var s=PRESET_PACKS[pp].sources&&PRESET_PACKS[pp].sources[cat]&&PRESET_PACKS[pp].sources[cat][type];
                if (s) {
                    for (var si=0; si<s.length; si++) {
                        var item = s[si];
                        if (item.indexOf("http")!==0 && item.indexOf("meme-api:")!==0) {
                            item = "meme-api:" + item;
                        }
                        out.push(item);
                    }
                }
            }
        }
        var cu=storage.customSources&&storage.customSources[cat]&&storage.customSources[cat][type];
        if (cu) {
            for (var ci=0; ci<cu.length; ci++) {
                var cItem = cu[ci];
                if (cItem.indexOf("http")!==0 && cItem.indexOf("meme-api:")!==0) {
                    cItem = "meme-api:" + cItem;
                }
                out.push(cItem);
            }
        }
        return out;
    }

    function fetchMedia(type, cat, wantVideo) {
        var filter = wantVideo ? isVideo : isImage;
        var sources = buildSources(type, cat);
        if (!sources.length) return Promise.resolve(null);

        // Shuffle baseline array to dynamically bypass rate-limiting
        sources.sort(function() { return 0.5 - Math.random(); });

        function attempt(index) {
            if (index >= sources.length || index >= 12) return Promise.resolve(null);
            var src = sources[index];

            if (src.indexOf("http") === 0) {
                return fetch(src)
                    .then(function(res) {
                        if (!res.ok) return attempt(index + 1);
                        return res.json().then(function(data) {
                            var u = "";
                            if (data.results && data.results[0]) u = data.results[0].url || "";
                            else u = data.url || data.file || data.message || data.src || data.image || data.link || "";
                            
                            // Nekos.best URLs often lack extensions natively, so we whitelist them if valid.
                            if (u && (filter(u) || src.indexOf("nekos.best") > -1)) return u;
                            return attempt(index + 1);
                        });
                    })
                    .catch(function() { return attempt(index + 1); });
            }

            var sub = src.replace("meme-api:", "");
            return fetch("https://meme-api.com/gimme/" + sub)
                .then(function(r) {
                    if (!r.ok) return attempt(index + 1);
                    return r.json().then(function(d) {
                        if (d && d.url && filter(d.url)) {
                            if (cat === "sfw" && d.nsfw) return attempt(index + 1);
                            return d.url;
                        }
                        return attempt(index + 1);
                    });
                })
                .catch(function() { return attempt(index + 1); });
        }
        return attempt(0);
    }

    // ── Settings View Component ───────────────────────────────────────────────────
    exports.settings = function SettingsView() {
        var tabS=React.useState("packs"); var tab=tabS[0]; var setTab=tabS[1];
        var catS=React.useState("sfw");   var cat=catS[0]; var setCat=catS[1];
        var typS=React.useState("femboy");var typ=typS[0]; var setTyp=typS[1];
        var inpS=React.useState("");      var inp=inpS[0]; var setInp=inpS[1];
        var tikS=React.useState(0);       var setTik=tikS[1];
        var refresh=function(){ setTik(function(t){ return t+1; }); };
        var epacks=storage.enabledPacks||[];
        var custom=(storage.customSources&&storage.customSources[cat]&&storage.customSources[cat][typ])||[];
        var e=React.createElement, SV=RN.ScrollView, V=RN.View, T=RN.Text, TI=RN.TextInput, TO=RN.TouchableOpacity;
        function Pill(label,active,fn,mr){ return e(TO,{onPress:fn,style:{flex:1,padding:10,backgroundColor:active?"#5865F2":"#2B2D31",borderRadius:8,alignItems:"center",marginRight:mr||0}},e(T,{style:{color:"#fff",fontWeight:"bold"}},label)); }
        return e(SV,{style:{flex:1},contentContainerStyle:{padding:16}},
            e(V,{style:{flexDirection:"row",marginBottom:16}}, Pill("📦 Packs",tab==="packs",function(){setTab("packs");},8), Pill("✏️ Custom",tab==="custom",function(){setTab("custom");})),
            tab==="packs"&&e(V,null,
                e(T,{style:{color:"#aaa",marginBottom:12,fontSize:13}},"Alternative configurations enabled here. Sources auto-rotate if blocked."),
                PRESET_PACKS.map(function(pack){
                    var on=epacks.indexOf(pack.id)>-1;
                    return e(TO,{key:pack.id,onPress:function(){ var i=storage.enabledPacks.indexOf(pack.id); if(i>-1) storage.enabledPacks.splice(i,1); else storage.enabledPacks.push(pack.id); refresh(); },style:{backgroundColor:on?"#1a3a6e":"#2B2D31",borderRadius:10,padding:14,marginBottom:10,borderWidth:1,borderColor:on?"#5865F2":"#444"}},
                        e(V,{style:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}, e(T,{style:{color:"#fff",fontWeight:"bold",fontSize:15,flex:1}},pack.label), e(T,{style:{fontSize:18}},on?"✅":"⬜")),
                        e(T,{style:{color:"#aaa",fontSize:12,marginTop:4}},pack.description));
                })
            ),
            tab==="custom"&&e(V,null,
                e(V,{style:{flexDirection:"row",marginBottom:8}}, Pill("SFW",cat==="sfw",function(){setCat("sfw");},8), Pill("NSFW",cat==="nsfw",function(){setCat("nsfw");})),
                e(V,{style:{flexDirection:"row",marginBottom:12}}, Pill("Femboy",typ==="femboy",function(){setTyp("femboy");},8), Pill("Tomboy",typ==="tomboy",function(){setTyp("tomboy");})),
                e(T,{style:{color:"#aaa",fontSize:12,marginBottom:8}},"Subreddit name (e.g. femboymemes) OR complete JSON URL"),
                e(TI,{style:{backgroundColor:"#1E1F22",color:"#fff",padding:12,borderRadius:8,borderWidth:1,borderColor:"#444",marginBottom:8},placeholder:"subreddit or https://...",placeholderTextColor:"#555",value:inp,onChangeText:setInp,autoCapitalize:"none",autoCorrect:false}),
                e(TO,{onPress:function(){ var v=inp.trim(); if(!v||custom.indexOf(v)>-1) return; storage.customSources[cat][typ].push(v); setInp(""); refresh(); },style:{backgroundColor:"#5865F2",padding:12,borderRadius:8,alignItems:"center",marginBottom:20}},e(T,{style:{color:"#fff",fontWeight:"bold"}},"+ Add Source")),
                e(T,{style:{color:"#fff",fontWeight:"bold",marginBottom:8}},"Your sources — "+cat.toUpperCase()+" / "+typ+":"),
                custom.length===0?e(T,{style:{color:"#555",fontStyle:"italic"}},"None yet."):custom.map(function(src,idx){
                    return e(V,{key:idx,style:{flexDirection:"row",alignItems:"center",backgroundColor:"#2B2D31",padding:10,borderRadius:8,marginBottom:8}},
                        e(T,{style:{color:"#ddd",flex:1,marginRight:8},numberOfLines:1},src),
                        e(TO,{onPress:function(){ storage.customSources[cat][typ].splice(idx,1); refresh(); }},e(T,{style:{color:"#ff5555",fontWeight:"bold",fontSize:16}},"✕")));
                })
            )
        );
    };

    // ── Commands Operational Engine ───────────────────────────────────────────────
    var unregFns=[], activeGuesses={};

    var combos=[["femboy","sfw"],["femboy","nsfw"],["tomboy","sfw"],["tomboy","nsfw"]];
    
    combos.forEach(function(pair){
        var type=pair[0], cat=pair[1], name=cat==="nsfw"?"nsfw_"+type:type;
        
        // Public Image Deployment Stream
        unregFns.push(registerCommand({
            name:name, untranslatedName:name,
            description:"Send a "+cat.toUpperCase()+" "+type+" image to this channel",
            execute:function(args,ctx){
                var cid=getChannelId(ctx);
                
                // IMPORTANT: Returning the Promise keeps the Discord execution thread alive
                // until the network request officially resolves.
                return fetchMedia(type,cat,false).then(function(url){
                    if (!url) {
                        try { MA.sendBotMessage(cid, "❌ Global Fetch Failure: All accessible endpoints returned empty records."); } catch(e){}
                        return; // Returning void prevents a blank public message
                    }
                    
                    // Resolving with an object structured like this instructs Vendetta
                    // to natively dispatch the message publicly as your user account.
                    return { content: url };
                }).catch(function(err){
                    try { MA.sendBotMessage(cid, "❌ Exception processing background worker: " + err.message); } catch(e){}
                });
            }
        }));

        // Public Video Deployment Stream
        unregFns.push(registerCommand({
            name:name+"_video", untranslatedName:name+"_video",
            description:"Send a "+cat.toUpperCase()+" "+type+" video to this channel",
            execute:function(args,ctx){
                var cid=getChannelId(ctx);
                
                return fetchMedia(type,cat,true).then(function(url){
                    if (!url) {
                        try { MA.sendBotMessage(cid, "❌ Global Fetch Failure: No format match found on non-blocked routes."); } catch(e){}
                        return;
                    }
                    return { content: url };
                }).catch(function(err){
                    try { MA.sendBotMessage(cid, "❌ Exception processing background worker: " + err.message); } catch(e){}
                });
            }
        }));
    });

    // Public Guessing Game
    unregFns.push(registerCommand({
        name:"guess", untranslatedName:"guess",
        description:"Start a public Femboy or Tomboy guessing game",
        execute:function(args,ctx){
            var cid=getChannelId(ctx);
            var type=Math.random()>0.5?"femboy":"tomboy";
            
            return fetchMedia(type,"sfw",false).then(function(url){
                if (!url) {
                    try { MA.sendBotMessage(cid, "❌ Setup Failed: Could not gather valid game asset over network."); } catch(e){}
                    return;
                }
                activeGuesses[cid]=type;
                var msg = "📸 **Femboy or Tomboy?**\nUse `/answer` to submit your guess!\n\n"+url;
                return { content: msg };
            }).catch(function(err){
                try { MA.sendBotMessage(cid, "❌ Game Crash: " + err.message); } catch(e){}
            });
        }
    }));

    // Public Answer Evaluation
    unregFns.push(registerCommand({
        name:"answer", untranslatedName:"answer",
        description:"Submit your guess for the current /guess game",
        options:[{
            name:"choice", displayName:"choice", description:"Your guess",
            type:3, required:true,
            choices:[
                { name:"femboy", displayName:"femboy", value:"femboy" },
                { name:"tomboy", displayName:"tomboy", value:"tomboy" }
            ]
        }],
        execute:function(args,ctx){
            var cid=getChannelId(ctx), correct=activeGuesses[cid], result = "";
            
            if (!correct) { 
                result = "❌ No active game session found in this channel. Run `/guess` first."; 
            } else {
                var guess=args&&args[0]&&args[0].value, won=guess===correct;
                result = won?"✅ **Correct!** Identity confirmed: **"+correct+"**!":"❌ **Wrong!** Target profile was **"+correct+"**, not a "+guess+"!";
                delete activeGuesses[cid];
            }
            
            return { content: result };
        }
    }));

    exports.onUnload=function(){
        for (var i=0;i<unregFns.length;i++) try{ unregFns[i](); }catch(e){}
        unregFns=[]; activeGuesses={};
    };

    return exports;
})({}, vendetta.patcher, vendetta.metro, vendetta.plugin.storage);
                                
