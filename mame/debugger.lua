-- JS debug support for MAME using -debugger none

mamedbg = {}

local debugging = false
local stopped = false
local targetPC = nil

function mamedbg.init()
  cpu = manager:machine().devices[":maincpu"]
  mem = cpu.spaces["program"]
  machine = manager:machine()
  debugger = machine:debugger()
  mamedbg.reset()
  emu.register_periodic(function ()
    if debugging and not stopped then
      local exec_state = debugger.execution_state
      if exec_state == "stop" then
        -- Save CPU register values NOW before execution drifts
        lastBreakCPU = {}
        for k, v in pairs(cpu.state) do
          lastBreakCPU[k] = v.value
        end
        local pc = lastBreakCPU["PC"] or 0
        print(string.format("[mamedbg] periodic: stopped at PC=0x%04x (target was 0x%04x)", pc, targetPC or -1))
        lastBreakState = machine:buffer_save()
        emu.pause()
        stopped = true
      end
    end
  end)
end

function mamedbg.reset()
  debugging = false
  stopped = false
  targetPC = nil
end

function mamedbg.start()
  debugging = true
  stopped = false
end

function mamedbg.is_stopped()
  return debugging and stopped
end

function mamedbg.continue()
  debugger:command("g")
end

function mamedbg.runTo(addr)
  targetPC = addr
  print(string.format("[mamedbg] runTo: target PC=0x%04x", addr))
  debugger:command(string.format("g %x", addr))
  mamedbg.start()
end

function mamedbg.runToVsync(addr)
  debugger:command("gv")
  mamedbg.start()
end

function mamedbg.runUntilReturn(addr)
  debugger:command("out")
  mamedbg.start()
end

function mamedbg.step()
  local pc = cpu.state["PC"].value
  targetPC = nil
  print(string.format("[mamedbg] step: from PC=0x%04x", pc))
  debugger:command("step")
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
