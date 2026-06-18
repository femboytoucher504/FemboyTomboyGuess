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

    // Allows images, gifs, and common video formats
    const isValidMedia = (url) => /\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(url);
    
    let activeGuesses = {};

    async function fetchImage(type, category) {
        const subredditList = sources[category][type];
        for (let i = 0; i < 5; i++) {
            const randomSub = subredditList[Math.floor(Math.random() * subredditList.length)];
            try {
                const res = await fetch("https://meme-api.com/gimme/" + randomSub);
                const data = await res.json();
                if (data && data.url && isValidMedia(data.url)) return data.url;
            } catch (e) { continue; }
        }
        return null;
    }

    const myCommands = [
        // SFW Commands
        ...["femboy", "tomboy"].map((type, i) => ({
            id: "-20" + i,
            untranslatedName: type,
            displayName: type,
            untranslatedDescription: "Send a SFW " + type + " picture",
            displayDescription: "Send a SFW " + type + " picture",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            execute: async (args, ctx) => {
                const url = await fetchImage(type, "sfw");
                if (!url) return { content: "❌ Could not find an image." };
                if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                return {};
            }
        })),
        // NSFW Commands
        ...["femboy", "tomboy"].map((type, i) => ({
            id: "-30" + i,
            untranslatedName: "nsfw_" + type,
            displayName: "nsfw_" + type,
            untranslatedDescription: "Send a NSFW " + type + " picture",
            displayDescription: "Send a NSFW " + type + " picture",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            execute: async (args, ctx) => {
                const url = await fetchImage(type, "nsfw");
                if (!url) return { content: "❌ Could not find an image." };
                if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                return {};
            }
        })),
        // Guess Game
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
                const url = await fetchImage(type, "sfw");
                if (!url) return { content: "❌ Could not find an image." };
                activeGuesses[ctx.channel.id] = type;
                if (MessageActions) MessageActions.sendMessage(ctx.channel.id, { content: "📸 **Guess!** Reply with `/answer tomboy` or `/answer femboy`.\n\n" + url, tts: false }, null, { nonce: Date.now().toString(), flags: 0 });
                return {};
            }
        },
        // Answer Command
        {
            id: "-402",
            untranslatedName: "answer",
            displayName: "answer",
            untranslatedDescription: "Submit your guess",
            displayDescription: "Submit your guess",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            options: [{ name: "choice", displayName: "choice", type: 3, required: true, choices: [{name: "tomboy", value: "tomboy"}, {name: "femboy", value: "femboy"}] }],
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

