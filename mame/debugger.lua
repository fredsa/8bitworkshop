-- JS debug support for MAME using -debugger none

mamedbg = {}

local debugging = false
local stopped = false

function prefix()
  if cpu == nil or debugger == nil then
    return "--namedbg--"
  end
  return string.format("%x (%s) ", cpu.state["PC"].value, debugger.execution_state)
end

function mamedbg.init()
  print('mamedbg.init()')
  cpu = manager:machine().devices[":maincpu"]
  mem = cpu.spaces["program"]
  machine = manager:machine()
  debugger = machine:debugger()
  print(prefix()..'mamedbg.init(): mamedbg.reset()')
  mamedbg.reset()
  print(prefix()..'mamedbg.init(): emu.register_periodic()')
  emu.register_periodic(function ()
    if debugging and not stopped then
      lastBreakState = machine.buffer_save()
      print(prefix()..'periodic: state=', debugger.execution_state, 'lastBreakState=', lastBreakState)
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
  print(prefix()..'mamedbg.continue(): debugger:command `g`')
  debugger:command("g")
end

function mamedbg.runTo(...)
  print("runTo")
  local addrs = {...}
  local addrStrs = {}
  for _, addr in ipairs(addrs) do
    print("addr "..addr)
    table.insert(addrStrs, string.format("0x%04x", addr))
    print(prefix() .. string.format('mamedbg.runTo: debugger.command `bpset %x`', addr))
    debugger:command(string.format("bpset %x", addr))
  end
  print(prefix()..'namedbg.runTo: debugger:command `g`')
  debugger:command("g")
  mamedbg.start()
end

function mamedbg.runToVsync(addr)
  print(prefix()..'mamedbg.runToVsync: debugger:command `gv`')
  debugger:command("gv")
  mamedbg.start()
end

function mamedbg.runUntilReturn(addr)
  print(prefix() .. 'mamedbg.runUntilReturn(' .. tostring(addr) .. '): debugger:command `out`')
  debugger:command("out")
  mamedbg.start()
end

function mamedbg.step()
  print(prefix()..'debugger:command `step`')
  debugger:command("mamedbg.step(): mamedbg.start()")
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

print("parsed Lua debugger script")
