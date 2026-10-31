local logger     = require("logger")
local millennium = require("millennium")
local json       = require("json")
local fs         = require("fs")

-- What the other library plugins already handle, so this one stays out of their way: Steam Cartridges
-- draws the achievements itself when it is on, and NativeGameLink and Game Data Linker each draw their
-- own panel on the shortcuts they linked.

local function read_json(path)
    local file = io.open(path, "rb")
    if not file then return nil end
    local text = file:read("*a")
    file:close()
    local ok, value = pcall(json.decode, text or "")
    if ok and type(value) == "table" then return value end
    return nil
end

local function enabled_plugins()
    local config = read_json(fs.join(millennium.steam_path(), "millennium", "config", "config.json"))
    local enabled = {}
    local list = config and config.plugins and config.plugins.enabledPlugins
    for _, name in ipairs(type(list) == "table" and list or {}) do enabled[tostring(name)] = true end
    return enabled
end

local function add_mapped(into, path)
    for key in pairs(read_json(path) or {}) do into[#into + 1] = tostring(key) end
end

local function plugin_version(folder)
    local manifest = read_json(fs.join(millennium.steam_path(), "millennium", "plugins", folder, "plugin.json"))
    return manifest and tostring(manifest.version or "") or ""
end

-- JSON string: { cartridges = bool, cartridges_version = string, linked = { shortcut ids } }
function environment()
    local enabled = enabled_plugins()
    local linked = {}
    local appdata = os.getenv("APPDATA") or ""
    if enabled["NativeGameLinkForSteam"] and appdata ~= "" then
        add_mapped(linked, fs.join(appdata, "NativeGameLinkForSteam", "mappings.json"))
    end
    if enabled["game-data-linker"] then
        add_mapped(linked, fs.join(millennium.steam_path(), "millennium", "plugins", "game-data-linker", "mappings.json"))
    end
    return json.encode({
        cartridges = enabled["steam-cartridges"] == true,
        cartridges_version = plugin_version("steam-cartridges"),
        linked = linked,
    })
end

-- Steam's binary KeyValues (shortcuts.vdf): 0x00 opens a map, 0x01 a string, 0x02 an int32,
-- 0x07 a uint64, 0x08 closes. Steam's UI can write a shortcut but no longer read one back.
local function parse_vdf(data)
    local pos = 1
    local function cstring()
        local finish = data:find("\0", pos, true)
        if not finish then return nil end
        local value = data:sub(pos, finish - 1)
        pos = finish + 1
        return value
    end
    local function int32()
        local b1, b2, b3, b4 = data:byte(pos, pos + 3)
        if not b4 then return nil end
        pos = pos + 4
        return b1 + b2 * 256 + b3 * 65536 + b4 * 16777216
    end
    local function map(depth)
        if depth > 8 then return nil end
        local out = {}
        while pos <= #data do
            local kind = data:byte(pos)
            pos = pos + 1
            if kind == 8 then return out end
            local key = cstring()
            if not key then return nil end
            if kind == 0 then
                out[key] = map(depth + 1)
                if out[key] == nil then return nil end
            elseif kind == 1 then
                out[key] = cstring()
            elseif kind == 2 then
                out[key] = int32()
            elseif kind == 7 then
                pos = pos + 8
            else
                return nil
            end
        end
        return out
    end
    return map(0)
end

local function field(entry, name)
    for key, value in pairs(entry) do
        if string.lower(key) == name then return value end
    end
    return nil
end

local function account_dirs()
    local root = fs.join(millennium.steam_path(), "userdata")
    local ok, entries = pcall(fs.list, root)
    local dirs = {}
    for _, entry in ipairs(ok and type(entries) == "table" and entries or {}) do
        local name = tostring(entry.name or (tostring(entry.path or ""):match("([^\\/]+)[\\/]?$")) or "")
        if entry.is_directory and name:match("^%d+$") then dirs[#dirs + 1] = fs.join(root, name) end
    end
    return dirs
end

-- JSON string: [{ appid (unsigned), exe, launch_options, name }] for every account on this PC.
function shortcuts()
    local list = {}
    for _, dir in ipairs(account_dirs()) do
        local file = io.open(fs.join(dir, "config", "shortcuts.vdf"), "rb")
        if file then
            local data = file:read("*a")
            file:close()
            local ok, parsed = pcall(parse_vdf, data or "")
            local entries = ok and type(parsed) == "table" and field(parsed, "shortcuts") or nil
            for _, entry in pairs(type(entries) == "table" and entries or {}) do
                local appid = type(entry) == "table" and tonumber(field(entry, "appid")) or nil
                if appid then
                    list[#list + 1] = {
                        appid = appid,
                        exe = tostring(field(entry, "exe") or ""),
                        launch_options = tostring(field(entry, "launchoptions") or ""),
                        name = tostring(field(entry, "appname") or ""),
                    }
                end
            end
        end
    end
    return json.encode(list)
end

function fe_log(msg)
    logger:info("[FE] " .. tostring(msg))
    return "ok"
end

local function on_load()
    logger:info("AW Next achievements loaded, Millennium " .. tostring(millennium.version()))
    millennium.ready()
end

local function on_unload()
    logger:info("AW Next achievements unloaded")
end

local function on_frontend_loaded()
    logger:info("Frontend loaded")
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded,
}
