(function(exports, patcher, metro) {
    "use strict";
    
    const Commands = metro.findByProps("BUILT_IN_COMMANDS");
    const MessageActions = metro.findByProps("sendMessage");
    
    const femboySources = ["femboy", "traditionalfemboys", "femboymemes"];
    const tomboySources = ["tomboy", "AnimeTomboys"];
    
    async function fetchImage(type) {
        const sources = type === "femboy" ? femboySources : tomboySources;
        const randomSub = sources[Math.floor(Math.random() * sources.length)];
        try {
            const res = await fetch("https://meme-api.com/gimme/" + randomSub);
            const data = await res.json();
            return data.url || "Error: No image URL found.";
        } catch (e) {
            return "Fetch failed: " + e.message;
        }
    }

    const myCommands = [
        {
            id: "-102",
            untranslatedName: "femboy",
            displayName: "femboy",
            untranslatedDescription: "Sends a random femboy picture",
            displayDescription: "Sends a random femboy picture",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            options: [],
            execute: async function(args, ctx) {
                const url = await fetchImage("femboy");
                MessageActions.sendMessage(ctx.channel.id, { 
                    content: url,
                    tts: false,
                    invalidEmojis: [],
                    validNonShortcutEmojis: []
                }, null, {
                    nonce: Date.now().toString(),
                    flags: 0
                });
                return {};
            }
        },
        {
            id: "-103",
            untranslatedName: "tomboy",
            displayName: "tomboy",
            untranslatedDescription: "Sends a random tomboy picture",
            displayDescription: "Sends a random tomboy picture",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            options: [],
            execute: async function(args, ctx) {
                const url = await fetchImage("tomboy");
                MessageActions.sendMessage(ctx.channel.id, { 
                    content: url,
                    tts: false,
                    invalidEmojis: [],
                    validNonShortcutEmojis: []
                }, null, {
                    nonce: Date.now().toString(),
                    flags: 0
                });
                return {};
            }
        },
        {
            id: "-104",
            untranslatedName: "guess",
            displayName: "guess",
            untranslatedDescription: "Tomboy or Femboy? Play the guessing game.",
            displayDescription: "Tomboy or Femboy? Play the guessing game.",
            type: 1,
            inputType: 0,
            applicationId: "-1",
            options: [],
            execute: async function(args, ctx) {
                const isTomboy = Math.random() > 0.5;
                const type = isTomboy ? "tomboy" : "femboy";
                const url = await fetchImage(type);
                MessageActions.sendMessage(ctx.channel.id, { 
                    content: url + "\n\n**Answer:** ||It's a " + type + "!||",
                    tts: false,
                    invalidEmojis: [],
                    validNonShortcutEmojis: []
                }, null, {
                    nonce: Date.now().toString(),
                    flags: 0
                });
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
m
