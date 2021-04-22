function forecast_shortterm()
	forecast_shortterm_occupancy()
	forecast_shortterm_admissions()
end

function forecast_shortterm_occupancy()
	run(`python3 forecast_occupancy.py`, wait=true)
	return
end

function forecast_shortterm_admissions()
	run(`python3 forecast_admissions.py`, wait=true)
	return
end
