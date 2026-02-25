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
  0x0000, -- Start of RAM

  0xfffa, -- NMI
  0xfffc, -- RESET
  0xfffe, -- IRQ

  0xa000, -- Start of ROM

  0xa026, -- LDA #42
  0xa028, -- LDA #42
  0xa02a, -- LDA #42
  0xa02c, -- LDA #42
  0xa02e, -- LDA #42
   --        LDA #42
   --        LDA #42
   --        …
   --        LDA #42
   --        LDA #42
  0xa042, -- LDA #42

   --        LDA #42
   --        LDA #42
   -- LOOP:
   --        NOP
   --        NOP
  0xa069, -- NOP
   --        NOP
   --        NOP
   --        NOP
   --        NOP
   --        NOP
   --        JMP LOOP
}

function prefix()
  if cpu == nil or machine == nil or debugger == nil then
    return "--mamedbg--"
  end
  local state = tostring(debugger.execution_state)
  local state_char = (state == "run" and "🟢") or (state == "stop" and "🛑") or state
  -- local machine_addr = tostring(cpu):match("0x%x+") or "xx"
  -- return string.format("%s %x%s ", machine_addr, cpu.state["PC"].value, state_char)
  return string.format("%04x%s ", cpu.state["PC"].value, state_char)
end

function mamedbg.init()
  print('mamedbg.init() version ' .. mamedbg.version .. ' (MAME ' .. emu.app_version() .. ')')
  machine = manager:machine()
  cpu = machine.devices[":maincpu"]
  mem = cpu.spaces["program"]
  video = machine:video()
  cpudebug = cpu:debug()
  debugger = machine:debugger()


  -- print("--- CPU DUMP ---")
  -- print(dump_obj(cpu, 1))
  -- print(dump_obj(getmetatable(cpu), 1))

  -- print("-- MEM DUMP ---")
  -- print(dump_obj(mem, 1))
  -- print(dump_obj(getmetatable(mem), 1))

  -- print("--- MACHINE DUMP ---")
  -- print(dump_obj(machine, 1))
  -- print(dump_obj(getmetatable(machine), 1))

  -- print("--- VIDEO DUMP ---")
  -- print(dump_obj(video, 1))
  -- print(dump_obj(getmetatable(video), 1))

  -- print("--------------------")
  -- print("--- CPU DEBUG DUMP ---")
  -- print(dump_obj(cpudebug, 1))
  -- print(dump_obj(getmetatable(cpudebug), 1))


  print(prefix()..'mamedbg.init(): mamedbg.denote_reset()')
  mamedbg.denote_reset()

  emu.register_periodic(function ()
    local current_pc = cpu.state["PC"].value
    local current_state = tostring(debugger.execution_state)

    if last_state ~= current_state or last_pc ~= current_pc then
       if last_state ~= nil and last_pc ~= nil then
         -- "Stuck" check
         if last_state == "stop" and current_state == "stop" and last_pc ~= current_pc then
            print(prefix()..'>>>>>>>>>>>> periodic: WARNING: CPU moved! PC '..string.format("%x", last_pc)..' -> '..string.format("%x", current_pc))
            -- print("debugger:command(`stop`)")
            -- debugger:command("stop")
            -- emu.pause()
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
  print(prefix()..'mamedbg.soft_reset: machine:soft_reset()')
  machine:soft_reset()
  mamedbg.denote_reset()
  -- cpu.state["PC"].value = 0xa000
  cpu.state["PC"].value = 0xfffc
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
  -- mamedbg.unpause()
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
  -- mamedbg.unpause()
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

print("parsed Lua debugger script version " .. mamedbg.version)
