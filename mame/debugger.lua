-- JS debug support for MAME using -debugger none

mamedbg = {}

local debugging = false
local stopped = false

function prefix()
  if cpu == nil or machine== nil or debugger == nil then
    return "--namedbg--"
  end
  return string.format("%x (%s)", cpu.state["PC"].value, debugger.execution_state)
end

function mamedbg.init()
  print('mamedbg.init()')
  cpu = manager:machine().devices[":maincpu"]
  -- print("--- CPU DUMP ---")
  -- print(dump_obj(cpu, 1))
  -- print(dump_obj(getmetatable(cpu), 1))

  mem = cpu.spaces["program"]
  -- print("-- MEM DUMP ---")
  -- print(dump_obj(mem, 1))
  -- print(dump_obj(getmetatable(mem), 1))

  machine = manager:machine()
  -- print("--- MACHINE DUMP ---")
  -- print(dump_obj(machine, 1))
  -- print(dump_obj(getmetatable(machine), 1))

  video = machine:video()
  -- print("--- VIDEO DUMP ---")
  -- print(dump_obj(video, 1))
  -- print(dump_obj(getmetatable(video), 1))


  cpudebug = cpu:debug()
  -- print("--------------------")
  -- print("--- CPU DEBUG DUMP ---")
  -- print(dump_obj(cpudebug, 1))
  -- print(dump_obj(getmetatable(cpudebug), 1))

  debugger = machine:debugger()
  print(prefix()..'mamedbg.init(): mamedbg.reset()')
  mamedbg.reset()
  print(prefix()..'mamedbg.init(): emu.register_periodic()')
  emu.register_periodic(function ()
    if debugging and not stopped then
      lastBreakState = machine.buffer_save()
      print(prefix()..'periodic: lastBreakState=' .. lastBreakState)
      print(prefix()..'periodic: emu.pause()')
      emu.pause()
      stopped = true
    end
  end)
end

function mamedbg.reset()
  print(prefix()..'mamedbg.reset()')
  debugging = false
  stopped = false
end

function mamedbg.start()
  print(prefix()..'mamedbg.start()')
  debugging = true
  stopped = false
end

function mamedbg.is_stopped()
  return debugging and stopped
end

function mamedbg.continue()
  -- print(prefix()..'namedbg.continue(): `g`')
  -- debugger:command("g")
  print(prefix() .. 'mamedbg.continue(): cpudebug:go()')
  cpudebug:go()
end

function mamedbg.runTo(...)
  local addrs = {...}
  local addrStrs = {}
  for _, addr in ipairs(addrs) do
    table.insert(addrStrs, string.format("%04x", addr))
  end
  print(prefix()..'mamedbg.runTo('..table.concat(addrStrs, ",")..')')

  for _, addr in ipairs(addrs) do
    -- print(prefix() .. string.format('mamedbg.runTo: `bpset %x`', addr))
    -- debugger:command(string.format("bpset %x", addr))
    print(prefix() .. string.format('mamedbg.runTo: cpudebug:bpset(%x)', addr))
    cpudebug:bpset(addr)
  end
  -- print(prefix()..'namedbg.runTo: `g`')
  -- debugger:command("g")
    print(prefix() .. 'mamedbg.runTo: cpudebug:go()')
    cpudebug:go()
  mamedbg.start()
end

function mamedbg.runToVsync(addr)
  print(prefix()..'mamedbg.runToVsync: `gv`')
  debugger:command("gv")
  mamedbg.start()
end

function mamedbg.runUntilReturn(addr)
  print(prefix() .. 'mamedbg.runUntilReturn(' .. tostring(addr) .. '): `out`')
  print(prefix() .. 'mamedbg.runUntilReturn(' .. tostring(addr) .. '): debugger:command("out")')
  debugger:command("out")
  mamedbg.start()
end

function mamedbg.step()
  print(prefix()..'`step`')
  -- print(prefix()..'mamedbg.step(): debugger:command("step")')
  -- debugger:command("step")
  print(prefix() .. string.format('mamedbg.step: cpu:step()'))
  cpu:debug():step()
  cpudebug:step()
  mamedbg.start()
end

function string.fromhex(str)
    return (str:gsub('..', function (cc)
        return string.char(tonumber(cc, 16))
    end))
end

function string.tohex(str)
    return (str:gsub('.', function (c)
        return string.format('%02X', string.byte(c))
    end))
end

function table.tojson(t)
  local result = {}
  for key, value in pairs(t) do
    -- prepare json key-value pairs and save them in separate table
    table.insert(result, string.format("\"%s\":\"%s\"", key, value))
  end
  -- get simple json string
  return "{" .. table.concat(result, ",") .. "}"
end

function dump_obj(o, depth)
  depth = depth or 0
  if depth > 2 then return tostring(o) end
  if type(o) == 'table' or type(o) == 'userdata' then
    local s = ''
    local status, err = pcall(function()
      for k,v in pairs(o) do
        local ks = tostring(k)
        if type(k) ~= 'number' then ks = '"'..ks..'"' end
        if type(v) == 'table' or type(v) == 'userdata' then
          s = s .. string.rep("  ", depth) .. '['..ks..'] = ' .. dump_obj(v, depth + 1) .. '\n'
        else
          s = s .. string.rep("  ", depth) .. '['..ks..'] = ' .. tostring(v) .. '\n'
        end
      end
    end)
    if not status then return tostring(o) end
    if s == '' then return tostring(o) end
    return '{\n' .. s .. string.rep("  ", depth>0 and (depth-1) or 0) .. '}'
  else
    return tostring(o)
  end
end

print("parsed Lua debugger script")
