local i = 0
emu.register_periodic(function()
  if debugger.execution_state == "stop" then
     i = i + 1
     if i == 5 then
        print("triggering buffer_save while natively STOPPED")
        machine.buffer_save()
     end
  end
end)
