(function(exports, patcher, metro) {
    "use strict";
    
    const Commands = metro.findByProps("BUILT_IN_COMMANDS");
    const MessageActions = metro.findByProps("sendMessage");
    
    // --- SOURCES CONFIGURATION ---
    const sources = {
        sfw: {
            femboy: ["femboymemes", "femboysfw"],
            tomboy: ["tomboy", "AnimeTomboys"]
        },
        nsfw: {
            femboy: ["femboy", "traditionalfemboys"],
            tomboy: ["tomboygf"]
        }
    };

    // --- STRICT MEDIA FILTERS ---
    const isImage = (url) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    const isVideo = (url) => /\.(mp4|webm)$/i.test(url);
    
    let activeGuesses = {};

    // --- MEDIA FETCHER ---
    // Uses 15 retries to ensure it finds the specifically requested media type
    async function fetchMedia(type, category, mediaType) {
        const subredditList = sources[category][type];
        const filter = mediaType === "video" ? isVideo : isImage;
        
        for (let i = 0; i < 15; i++) {
            const randomSub = subredditList[Math.floor(Math.random() * subredditList.length)];
            try {
                const res = await fetch("https://meme-api.com/gimme/" + randomSub);
                const data = await res.json();
                if (data && data.url && filter(data.url)) return data.url;
            } catch (e) { continue; }
        }
        return null;
    }

    const myCommands = [
        // --- IMAGE & VIDEO COMMANDS (SFW & NSFW) ---
        ...["sfw", "nsfw"].flatMap(cat => 
            ["femboy", "tomboy"].flatMap(type => [
                {
                    id: `-${cat}-${type}-img`,
                    untranslatedName: cat === "nsfw" ? "nsfw_" + type : type,
                    displayName: cat === "nsfw" ? "nsfw_" + type : type,
                    untranslatedDescription: `Send a ${cat.toUpperCase()} ${type} image`,
                    displayDescription: `Send a ${cat.toUpperCase()} ${type} image`,
                    type: 1,
                    inputType: 0,
                    applicationId: "-1",
                    execute: async (args, ctx) => {
                        const url = await fetchMedia(type, cat, "image");
                        if (!url) return { content: "❌ Could not find an image." };
                        if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                        return {};
                    }
                },
                {
                    id: `-${cat}-${type}-vid`,
                    untranslatedName: cat === "nsfw" ? "nsfw_" + type + "_video" : type + "_video",
                    displayName: cat === "nsfw" ? "nsfw_" + type + "_video" : type + "_video",
                    untranslatedDescription: `Send a ${cat.toUpperCase()} ${type} video`,
                    displayDescription: `Send a ${cat.toUpperCase()} ${type} video`,
                    type: 1,
                    inputType: 0,
                    applicationId: "-1",
                    execute: async (args, ctx) => {
                        const url = await fetchMedia(type, cat, "video");
                        if (!url) return { content: "❌ Could not find a video." };
                        if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                        return {};
                    }
                }
            ])
        ),
        
        // --- GUESS GAME ---
        {
            id: "-401",
            untranslatedName: "guess",
            displayName: "guess",
            untranslatedDescription: "Guess the character!",
            displayDescription: "Guess the character!",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            execute: async (args, ctx) => {
                const isTomboy = Math.random() > 0.5;
                const type = isTomboy ? "tomboy" : "femboy";
                const url = await fetchMedia(type, "sfw", "image");
                if (!url) return { content: "❌ Could not find an image." };
                activeGuesses[ctx.channel.id] = type;
                if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: "📸 **Guess!** Reply with `/answer tomboy` or `/answer femboy`.\n\n" + url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                return {};
            }
        },

        // --- ANSWER COMMAND ---
        {
            id: "-402",
            untranslatedName: "answer",
            displayName: "answer",
            untranslatedDescription: "Submit your guess",
            displayDescription: "Submit your guess",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            options: [{ 
                name: "choice", 
                displayName: "choice", 
                type: 3, 
                required: true, 
                choices: [
                    {name: "tomboy", value: "tomboy"}, 
                    {name: "femboy", value: "femboy"}
                ] 
            }],
            execute: async (args, ctx) => {
                const userAnswer = args[0].value;
                const correctAnswer = activeGuesses[ctx.channel.id];
                if (!correctAnswer) return { content: "No active game! Type `/guess` to start." };
                
                const result = (userAnswer === correctAnswer) ? "✅ Correct!" : "❌ Wrong! It was " + correctAnswer + ".";
                if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: result, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                
                delete activeGuesses[ctx.channel.id];
                return {};
            }
        }
    ];

    // --- REGISTRATION & UNLOAD ---
    if (Commands && Commands.BUILT_IN_COMMANDS) {
        myCommands.forEach(cmd => Commands.BUILT_IN_COMMANDS.push(cmd));
    }

    exports.onUnload = () => {
        if (Commands && Commands.BUILT_IN_COMMANDS) {
            myCommands.forEach(cmd => {
                const index = Commands.BUILT_IN_COMMANDS.findIndex(c => c.id === cmd.id);
                if (index > -1) Commands.BUILT_IN_COMMANDS.splice(index, 1);
            });
        }
    };

    return exports;
})({}, vendetta.patcher, vendetta.metro);
                        
