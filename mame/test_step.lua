print("mamedbg.test_step loaded")
function mamedbg.test_step()
  print(prefix() .. "test_step: executing cpudebug:step() without unpause")
  cpudebug:step()
  print(prefix() .. "test_step: step executed. PC=" .. string.format("%x", cpu.state["PC"].value))
end
