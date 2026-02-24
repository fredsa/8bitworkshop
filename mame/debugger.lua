-- VERSION: 1.1.3 (FIXED: Step Drift + Native State)
-- JS debug support for MAME using -debugger none

mamedbg = {}
mamedbg.version = "1.1.3"

local debugging = false
local stopped = false
local hit = false
local last_state = nil
local last_pc = nil

local breakpoints = {
  0xa026,
  0xa028,
  0xa02a,
  0xa02c,
  0xa02e,
  0xa042,
  0xa069,
}

function prefix()
  if cpu == nil or machine == nil or debugger == nil then
    return "--mamedbg--"
  end
  local state = tostring(debugger.execution_state)
  local state_char = (state == "run" and "🟢") or (state == "stop" and "🛑") or state
  local machine_addr = tostring(cpu):match("0x%x+") or "xx"
  return string.format("%s %x%s ", machine_addr, cpu.state["PC"].value, state_char)
end

function mamedbg.init()
  print('mamedbg.init() version ' .. mamedbg.version .. ' (MAME ' .. emu.app_version() .. ')')
  machine = manager:machine()
  cpu = machine.devices[":maincpu"]
  mem = cpu.spaces["program"]
  video = machine:video()
  cpudebug = cpu:debug()
  debugger = machine:debugger()

  print(prefix()..'mamedbg.init(): mamedbg.denote_reset()')
  mamedbg.denote_reset()

  emu.register_periodic(function ()
    local current_pc = cpu.state["PC"].value
    local current_state = tostring(debugger.execution_state)

    if last_state ~= current_state or last_pc ~= current_pc then
       if last_state ~= nil and last_pc ~= nil then
         -- "Stuck" check
         if last_state == "stop" and current_state == "stop" and last_pc ~= current_pc then
            print(prefix()..'>>>>>>>>>>>> periodic: WARNING: CPU moved while in stop state! PC '..string.format("%x", last_pc)..' -> '..string.format("%x", current_pc))
            print("MAME_STOP")
            debugger:command("stop")
            emu.pause()
         end
       end
       last_state = current_state
       last_pc = current_pc
    end
  end)
end

function mamedbg.step()
  print(prefix()..'mamedbg.step()')
  hit = false
  mamedbg.denote_start()

  -- CRITICAL: cpudebug:step() tells MAME to execute one internal instruction.
  -- We MUST NOT call emu.unpause() here, as that would put it back in free-run mode.
  cpudebug:step()

  -- We don't call unpause() because step() should return to stop state immediately.
  -- JS side will poll is_stopped() to see when the transition happens.
end

function mamedbg.soft_reset()
  print(prefix()..'mamedbg.soft_reset()')
  mamedbg.denote_reset()
  cpu.state["PC"].value = 0xa000
  print(prefix()..'mamedbg.soft_reset(): NEW PC = ' .. string.format("%x", cpu.state["PC"].value))
  mamedbg.runTo(breakpoints)
end

function mamedbg.denote_reset()
  debugging = false
  stopped = false
  hit = false
  last_state = nil
  last_pc = nil
end

function mamedbg.denote_start()
  debugging = true
  stopped = false
  hit = false
  last_state = nil
  last_pc = nil
end

function mamedbg.is_stopped()
  if debugger == nil then return "false" end
  local state = tostring(debugger.execution_state)
  return tostring(debugging and (state == "stop"))
end

function mamedbg.continue()
  print(prefix()..'mamedbg.continue()')
  hit = false
  cpudebug:go()
  mamedbg.unpause()
end

function mamedbg.on_hit(addr)
  print(prefix()..'>>>>>>>>>>>> on_hit: HIT ' .. string.format("%x", addr))
  print("MAME_STOP")
  hit = true
  debugger:command("stop")
  emu.pause()
end

function mamedbg.runTo(addrs)
  print(prefix()..'mamedbg.runTo(...)')
  hit = false
  target_breakpoints = {}
  debugger:command("bpclear")
  for _, addr in ipairs(addrs) do
    target_breakpoints[addr] = true
    local action = string.format('lua mamedbg.on_hit(0x%x)', addr)
    cpudebug:bpset(addr, nil, action)
  end
  cpudebug:go()
  mamedbg.unpause()
  mamedbg.denote_start()
end

function mamedbg.breakNow()
  print(prefix()..'mamedbg.breakNow()')
  print("MAME_STOP")
  debugger:command("stop")
  mamedbg.denote_start()
end

function mamedbg.unpause()
  print(prefix()..'mamedbg.unpause()')
  emu.unpause()
end

print("parsed Lua debugger script version " .. mamedbg.version)
