-- JS debug support for MAME using -debugger none

mamedbg = {}

local debugging = false
local stopped = false
local target_breakpoints = {}

local breakpoints = {
  0xa026,
  0xa028,
  0xa042,
  0xa069,
}

function prefix()
  if cpu == nil or machine== nil or debugger == nil then
    return "--mamedbg--"
  end
  local state = tostring(debugger.execution_state)
  local state_char = (state == "run" and "🟢") or (state == "stop" and "🛑") or state
  local machine_addr = tostring(cpu):match("0x%x+") or "xx"
  return string.format("%s %x%s ", machine_addr, cpu.state["PC"].value, state_char)
end

function mamedbg.init()
  print('mamedbg.init()')
  machine = manager:machine()
  -- print("--- MACHINE DUMP ---")
  -- print(dump_obj(machine, 1))
  -- print(dump_obj(getmetatable(machine), 1))

  cpu = manager:machine().devices[":maincpu"]
  -- print("--- CPU DUMP ---")
  -- print(dump_obj(cpu, 1))
  -- print(dump_obj(getmetatable(cpu), 1))

  mem = cpu.spaces["program"]
  -- print("-- MEM DUMP ---")
  -- print(dump_obj(mem, 1))
  -- print(dump_obj(getmetatable(mem), 1))

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
  print(prefix()..'mamedbg.init(): mamedbg.denote_reset()')
  mamedbg.denote_reset()

  -- emu.add_machine_reset_notifier(function ()
  --   print(prefix()..'################# WE WERE RESET #################')
  --   mamedbg.denote_reset()
  -- end)

  -- emu.add_machine_stop_notifier(function ()
  --   print(prefix()..'################# WE WERE STOPPED #################')
  --   mamedbg.denote_stop()
  -- end)

  -- emu.add_machine_start_notifier(function ()
  --   print(prefix()..'################# WE WERE STARTED #################')
  --   mamedbg.denote_start()
  -- end)

  -- emu.add_machine_suspend_notifier(function ()
  --   print(prefix()..'################# WE WERE SUSPENDED #################')
  --   mamedbg.denote_suspend()
  -- end)

  -- emu.add_machine_resume_notifier(function ()
  --   print(prefix()..'################# WE WERE RESUMED #################')
  --   mamedbg.denote_resume()
  -- end)

  -- emu.add_machine_frame_notifier(function ()
  --   print(prefix()..'################# WE WERE FRAMED #################')
  --   mamedbg.denote_frame()
  -- end)

  hit = false;
  local last_state = nil
  local last_pc = nil

  emu.register_periodic(function ()
    local current_pc = cpu.state["PC"].value
    local current_state = tostring(debugger.execution_state)

    if last_state ~= current_state or last_pc ~= current_pc then
       if last_state ~= nil and last_pc ~= nil then
         print(prefix()..'>>>>>>>>>>>> periodic: CPU moved! state changed from '..tostring(last_state)..' to '..tostring(current_state)..', PC from '..string.format("%x", last_pc)..' to '..string.format("%x", current_pc))
         -- "Stuck" check: if we are supposed to be stopped, but the PC moved, forcefully re-stop
         if last_state == "stop" and current_state == "stop" and last_pc ~= current_pc then
            print(prefix()..'>>>>>>>>>>>> periodic: WARNING: CPU moved while in stop state! Forcing debugger stop and emu pause.')
            print("MAME_STOP")
            debugger:command("stop")
            emu.pause()
         end
       end
       last_state = current_state
       last_pc = current_pc
    end

    if hit then
      return
    end

    -- print(prefix()..'>>>>>>>>>>>> periodic')

    for i, address in ipairs(breakpoints) do
      if address == current_pc then
        print(prefix()..'>>>>>>>>>>>> periodic: HIT ' .. string.format("%x", current_pc) .. ' !!!!!!!!!!!!!!!!!!!!!!!!!!')
        print("MAME_STOP")
        hit = true
        break
      end
    end

    if debugging and not stopped then
      -- print(prefix()..'periodic: debugging=' .. tostring(debugging) .. ', stopped=' .. tostring(stopped))
      -- local current_pc = cpu.state["PC"].value
      -- if target_breakpoints[current_pc] then
        -- print(prefix()..'periodic: emu.pause()')
        -- emu.pause()
        -- stopped = true

      -- end
    else
      -- print(prefix()..'periodic: debugging=' .. tostring(debugging) .. ', stopped=' .. tostring(stopped))
    end
  end)
end

function mamedbg.soft_reset()
  print(prefix()..'mamedbg.soft_reset()')
  mamedbg.denote_reset()

  print(prefix()..'mamedbg.soft_reset(): PC <- 0xa000')
  cpu.state["PC"].value = 0xa000

  print(prefix()..'mamedbg.soft_reset(): mamedbg.runTo('.. mamedbg.hexList(breakpoints, ', ') ..')')
  mamedbg.runTo(breakpoints)
end

-- Helper to turn a table of numbers into a pretty hex string
function mamedbg.hexList(t)
    local formatted = {}
    for _, addr in ipairs(t) do
        table.insert(formatted, string.format("%04X", addr))
    end
    return table.concat(formatted, ", ")
end


function mamedbg.denote_reset()
  print(prefix()..'mamedbg.denote_reset()')
  debugging = false
  stopped = false
  hit = false
end

function mamedbg.denote_start()
  print(prefix()..'mamedbg.denote_start()')
  debugging = true
  stopped = false
end

function mamedbg.is_stopped()
  local state = tostring(debugger.execution_state)
  return debugging and (state == "stop")
end

function mamedbg.continue()
  print(prefix()..'mamedbg.continue()')
  hit = false
  -- print(prefix()..'mamedbg.continue(): `g`')
  -- debugger:command("g")
  print(prefix() .. 'mamedbg.continue(): cpudebug:go()')
  cpudebug:go()
  mamedbg.unpause() -- Ensure hard pause is lifted
end

function mamedbg.runTo(addrs)
  print(prefix()..'mamedbg.runTo(...)')
  hit = false
  target_breakpoints = {}

  debugger:command("bpclear")
  for _, addr in ipairs(addrs) do
    target_breakpoints[addr] = true
    -- print(prefix() .. string.format('mamedbg.runTo: `bpset %x`', addr))
    -- debugger:command(string.format("bpset %x", addr))
    print(prefix() .. string.format('mamedbg.runTo: cpudebug:bpset(%x, nil, "emu.pause()")', addr))
    bpid = cpudebug:bpset(addr, nil, "emu.pause()")
    print(prefix() .. string.format('mamedbg.runTo %x, bpid=%d', addr, bpid))
  end
  -- print(prefix()..'mamedbg.runTo: `g`')
  -- debugger:command("g")
    print(prefix() .. 'mamedbg.runTo: cpudebug:go()')
    cpudebug:go()
  mamedbg.denote_start()
end

function mamedbg.runToVsync(addr)
  print(prefix()..'crunToVsync: `gv`')
  debugger:command("gv")
  mamedbg.denote_start()
end

function mamedbg.runUntilReturn(addr)
  print(prefix() .. 'mamedbg.runUntilReturn(' .. tostring(addr) .. ')')
  print(prefix() .. 'mamedbg.runUntilReturn: debugger:command("out")')
  debugger:command("out")
  mamedbg.denote_start()
end

function mamedbg.breakNow()
  print(prefix()..'mamedbg.breakNow()')
  print("MAME_STOP")
  debugger:command("stop")
  mamedbg.denote_start()
end

function mamedbg.pause()
  print(prefix()..'mamedbg.pause()')
  -- print(prefix()..'mamedbg.pause: emu.pause()')
  -- emu.pause()
  stopped = true
end

function mamedbg.unpause()
  print(prefix()..'mamedbg.unpause()')
  -- print(prefix()..'mamedbg.unpause: emu.unpause()')
  emu.unpause()
  stopped = false
end

function mamedbg.step()
  print(prefix()..'mamedbg.step()')
  hit = false
  -- print(prefix()..'mamedbg.step: debugger:command("step")')
  -- debugger:command("step")
  print(prefix() .. string.format('mamedbg.step: cpudebug:step()'))
  cpudebug:step()
  mamedbg.denote_start()
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
