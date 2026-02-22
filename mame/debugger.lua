-- JS debug support for MAME using -debugger none

mamedbg = {}

local debugging = false
local stopped = false
local periodicCount = 0

function mamedbg.init()
  cpu = manager:machine().devices[":maincpu"]
  mem = cpu.spaces["program"]
  machine = manager:machine()
  debugger = machine:debugger()
  mamedbg.reset()
  emu.register_periodic(function ()
    if debugging and not stopped then
      periodicCount = periodicCount + 1
      local exec_state = debugger.execution_state
      local pc = cpu.state["PC"].value
      if exec_state == "stop" then
        -- CPU is held at breakpoint by debugger's "stop" state - no drift
        -- Save CPU register values at the exact breakpoint PC
        lastBreakCPU = {}
        for k, v in pairs(cpu.state) do
          lastBreakCPU[k] = v.value
        end
        local bpPC = lastBreakCPU["PC"] or 0
        print(string.format("[mamedbg] periodic #%d: exec_state=%s, STOPPED at PC=0x%04x", periodicCount, exec_state, bpPC))
        -- Do NOT call emu.pause() — it would cause drift since the frame
        -- completes before pausing. The debugger holds the CPU instead.
        stopped = true
      else
        -- Log every periodic tick while running (first 5 only to avoid spam)
        if periodicCount <= 5 then
          print(string.format("[mamedbg] periodic #%d: exec_state=%s, PC=0x%04x (still running)", periodicCount, exec_state, pc))
        end
      end
    end
  end)
end

function mamedbg.reset()
  debugging = false
  stopped = false
  debugger:command("wpclear")
end

function mamedbg.start()
  print(string.format("[mamedbg] start: debugging=%s->true, stopped=%s->false", tostring(debugging), tostring(stopped)))
  debugging = true
  stopped = false
  periodicCount = 0
end

function mamedbg.is_stopped()
  return debugging and stopped
end

function mamedbg.continue()
  debugger:command("g")
end

function mamedbg.runTo(...)
  local prePC = cpu.state["PC"].value
  local preExecState = debugger.execution_state
  print(string.format("[mamedbg] runTo: ENTER stopped=%s, PC=0x%04x, exec_state=%s", tostring(stopped), prePC, preExecState))

  -- If resuming from a breakpoint, restore CPU registers to breakpoint state
  -- (CPU drifts because emu.pause() is deferred to frame boundary)
  if stopped and lastBreakCPU then
    local savedPC = lastBreakCPU["PC"] or 0
    print(string.format("[mamedbg] runTo: restoring CPU from lastBreakCPU, savedPC=0x%04x", savedPC))
    for k, v in pairs(lastBreakCPU) do
      cpu.state[k].value = v
    end
    local restoredPC = cpu.state["PC"].value
    print(string.format("[mamedbg] runTo: restored CPU to PC=0x%04x", restoredPC))
  else
    print(string.format("[mamedbg] runTo: NOT restoring (stopped=%s, lastBreakCPU=%s)", tostring(stopped), tostring(lastBreakCPU ~= nil)))
  end

  debugger:command("wpclear")
  print(string.format("[mamedbg] runTo: after wpclear, exec_state=%s", debugger.execution_state))

  local pc = cpu.state["PC"].value
  local addrs = {...}
  local addrStrs = {}
  local skippedCurrent = false
  for _, addr in ipairs(addrs) do
    if addr == pc then
      -- Skip BP at current PC to avoid MAME's non-deterministic behavior:
      -- 'g' either re-triggers the same BP or skips it + the next one
      print(string.format("[mamedbg] runTo: SKIPPING bp at current PC=0x%04x", pc))
      skippedCurrent = true
    else
      table.insert(addrStrs, string.format("0x%04x", addr))
      debugger:command(string.format("wpset 0, 10000, r, PC == 0x%x", addr))
    end
  end

  print(string.format("[mamedbg] runTo: set BPs=[%s], current PC=0x%04x, skippedCurrent=%s",
    table.concat(addrStrs, ", "), pc, tostring(skippedCurrent)))

  print(string.format("[mamedbg] runTo: about to call start(), exec_state=%s", debugger.execution_state))
  mamedbg.start()
  print(string.format("[mamedbg] runTo: about to call emu.unpause(), exec_state=%s", debugger.execution_state))
  emu.unpause()
  print(string.format("[mamedbg] runTo: about to call 'g', exec_state=%s, PC=0x%04x", debugger.execution_state, cpu.state["PC"].value))
  debugger:command("g")
  print(string.format("[mamedbg] runTo: after 'g', exec_state=%s, PC=0x%04x", debugger.execution_state, cpu.state["PC"].value))
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
