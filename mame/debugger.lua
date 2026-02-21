-- JS debug support for MAME using -debugger none

mamedbg = {}

local debugging = false
local stopped = false

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
        -- CPU is held at breakpoint by debugger's "stop" state - no drift
        -- Save CPU register values at the exact breakpoint PC
        lastBreakCPU = {}
        for k, v in pairs(cpu.state) do
          lastBreakCPU[k] = v.value
        end
        local pc = lastBreakCPU["PC"] or 0
        print(string.format("[mamedbg] periodic: STOPPED at PC=0x%04x", pc))
        -- Do NOT call emu.pause() — it would cause drift since the frame
        -- completes before pausing. The debugger holds the CPU instead.
        stopped = true
      end
    end
  end)
end

function mamedbg.reset()
  debugging = false
  stopped = false
  debugger:command("bpclear")
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

function mamedbg.runTo(...)
  -- If resuming from a breakpoint, restore CPU registers to breakpoint state
  -- (CPU drifts because emu.pause() is deferred to frame boundary)
  if stopped and lastBreakCPU then
    for k, v in pairs(lastBreakCPU) do
      cpu.state[k].value = v
    end
    local pc = cpu.state["PC"].value
    print(string.format("[mamedbg] runTo: restored CPU to PC=0x%04x", pc))
  end

  debugger:command("bpclear")
  local addrs = {...}
  local addrStrs = {}
  for _, addr in ipairs(addrs) do
    table.insert(addrStrs, string.format("0x%04x", addr))
    debugger:command(string.format("bpset %x", addr))
  end

  local pc = cpu.state["PC"].value
  print(string.format("[mamedbg] runTo: targets=[%s], current PC=0x%04x", table.concat(addrStrs, ", "), pc))

  mamedbg.start()
  emu.unpause()
  debugger:command("g")
end

function mamedbg.runToVsync(addr)
  mamedbg.start()
  emu.unpause()
  debugger:command("gv")
end

function mamedbg.runUntilReturn(addr)
  mamedbg.start()
  emu.unpause()
  debugger:command("out")
end

function mamedbg.step()
  -- If resuming from a breakpoint, restore CPU registers to breakpoint state
  if stopped and lastBreakCPU then
    for k, v in pairs(lastBreakCPU) do
      cpu.state[k].value = v
    end
  end
  local pc = cpu.state["PC"].value
  print(string.format("[mamedbg] step: from PC=0x%04x", pc))
  mamedbg.start()
  emu.unpause()
  debugger:command("step")
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
