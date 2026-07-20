---
hide:
  - navigation
---

<h1 align="center">Common Issues</h1>

- `Error: connect ECONNREFUSED`: Minecraft refused to connect with mindcraft program. Most likely due to:
  - you have not opened your game to LAN in game settings
  - your LAN port is incorrect, make sure the one you enter in game is the same as specified in `settings.js`
  - you have the wrong version of minecraft, make sure your MC version is the same as specified in `settings.js`

- `ERR_MODULE_NOT_FOUND`: You are missing an npm package. Run `npm install`.

- Many issues are caused by out-of-date node modules or patches, especially after updates. Run `npm run reinstall` to clean `node_modules` and reinstall the locked dependency tree.

- **`npm install` fails with Python or C++ build errors**: This typically happens when building native modules like `gl`. Common solutions:
  - **Python not found** (macOS/Linux): If you see `python: command not found`, create a symlink: `sudo ln -s $(which python3) /usr/local/bin/python`
  - **C++20 errors or Node version issues**: Make sure you are using the supported Node 22 LTS release. You can switch versions with:
    ```bash
    nvm install 22
    nvm use 22
    npm run reinstall
    ```

- `My brain disconnected, try again`: Something is wrong with the LLM api. You may have the wrong API key, exceeded your rate limits, or other. Check the program outputs for more details.
  
- `I'm stuck!` or other issues with constantly getting stuck:
  - Mineflayer's pathfinder is imperfect. We have improved upon it with patches, but these might not have been applied properly. Make sure your code is up to date with the repository and run `npm run reinstall`.
  - The bot will still get stuck occasionally, but not constantly.
    
- `Why I added the api key but still prompted that the key can't be found?`
  - Possible reason 1: Did not modify keys.example.json to keys.json.
  - Possible reason 2: If you use vscode to edit, you need to `ctrl+s` to save the file for the changes to take effect.
  - Possible reason 3: Not setting the code path correctly in setting.js, use andy.js by default. 

<h1 align="center">Common Questions</h1>
- Mod Support? Mindcraft only supports client-side mods like optifine and sodium, though they can be tricky to set up. Mods that change minecraft game mechanics are not supported.
  
- Texture Packs? Apparently these cause issues and refuse to connect. Not sure why
  
- Baritone? Baritone is a mod that is completely different from mineflayer. There is currently no easy way to integrate the two programs.
