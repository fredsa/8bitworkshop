-- JS debug support for MAME using -debugger none

mamedbg = {}

local debugging = false
local stopped = false

function mamedbg.init()
  print('mamedbg.init()')
  cpu = manager:machine().devices[":maincpu"]
  mem = cpu.spaces["program"]
  machine = manager:machine()
  debugger = machine:debugger()
  print('mamedbg.init(): mamedbg.reset()')
  mamedbg.reset()
  print('mamedbg.init(): emu.register_periodic()')
  emu.register_periodic(function ()
    if debugging and not stopped then
      lastBreakState = machine.buffer_save()
      print('periodic: state=', debugger.execution_state, 'lastBreakState=', lastBreakState)
      print('periodic: emu.pause()')
      emu.pause()
      stopped = true
    end
  end)
end

function mamedbg.reset()
  print('mamedbg.reset()')
  debugging = false
  stopped = false
end

function mamedbg.start()
  print('mamedbg.start()')
  debugging = true
  stopped = false
end

function mamedbg.is_stopped()
  return debugging and stopped
end

function mamedbg.continue()
  print('mamedbg.continue(): debugger:command `g`')
  debugger:command("g")
end

function mamedbg.runTo(...)
  local addrs = {...}
  local addrStrs = {}
  for _, addr in ipairs(addrs) do
    table.insert(addrStrs, string.format("0x%04x", addr))
    print('mamedbg.runTo: debugger.command `bpset %x`' % addr)
    debugger:command(string.format("bpset %x", addr))
  end
  print('namedbg.runTo: debugger:command `g`')
  debugger:command("g")
  mamedbg.start()
end

function mamedbg.runToVsync(addr)
  print('mamedbg.runToVsync: debugger:command `gv`')
  debugger:command("gv")
  mamedbg.start()
end

function mamedbg.runUntilReturn(addr)
  print('mamedbg.runUntilReturn(",addr,"): debugger:command `out`')
  debugger:command("out")
  mamedbg.start()
end

function mamedbg.step()
  print('debugger:command `step`')
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
