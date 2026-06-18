import { registerCommand } from "@vendetta/commands";

let registeredCommands: (() => void)[] = [];

// Automatically scrapes and finds a valid image from the JSON endpoint
async function fetchRandomImage(type: "femboy" | "tomboy") {
    try {
        // Arrays mixing human and anime sources
        const sources = type === "femboy" 
            ? ["femboy", "femboymemes", "MildFemboys"] 
            : ["tomboy", "tomboys", "AnimeTomboys"];
            
        const randomSub = sources[Math.floor(Math.random() * sources.length)];
        const res = await fetch(`https://www.reddit.com/r/${randomSub}/hot.json?limit=50`);
        const json = await res.json();
        
        // Filter out videos, text posts, and ensure it's a direct image link
        const posts = json.data.children.filter((post: any) => 
            !post.data.is_video && 
            post.data.url && 
            post.data.post_hint === 'image'
        );
        
        if (posts.length === 0) return "No image found! Try again.";
        
        const randomPost = posts[Math.floor(Math.random() * posts.length)];
        return randomPost.data.url;
    } catch (e) {
        return "Failed to fetch an image. The source might be temporarily rate-limiting.";
    }
}

export default {
    onLoad: () => {
        // 1. Femboy Command
        registeredCommands.push(registerCommand({
            name: "femboy",
            description: "Sends a random femboy picture (human/anime mixed)",
            execute: async () => {
                const url = await fetchRandomImage("femboy");
                return { content: url };
            }
        }));

        // 2. Tomboy Command
        registeredCommands.push(registerCommand({
            name: "tomboy",
            description: "Sends a random tomboy picture (human/anime mixed)",
            execute: async () => {
                const url = await fetchRandomImage("tomboy");
                return { content: url };
            }
        }));

        // 3. Guessing Game Command
        registeredCommands.push(registerCommand({
            name: "guess",
            description: "Play the Tomboy or Femboy guessing game",
            execute: async () => {
                const isFemboy = Math.random() > 0.5;
                const type = isFemboy ? "femboy" : "tomboy";
                const url = await fetchRandomImage(type);
                
                return { 
                    content: `**Tomboy or Femboy?**\nMake your guess based on the image below, then tap the spoiler!\n\n||It's a **${isFemboy ? "Femboy" : "Tomboy"}**!||\n${url}`
                };
            }
        }));
    },
    onUnload: () => {
        // Clean up commands if the plugin is toggled off
        for (const unregister of registeredCommands) {
            unregister();
        }
        registeredCommands = [];
    }
}
