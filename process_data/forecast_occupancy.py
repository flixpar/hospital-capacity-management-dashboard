import os
import copy
import random
import datetime
import pickle
import requests
import re
import glob

import numpy as np
import pandas as pd

from sklearn.linear_model import LinearRegression
from sklearn.model_selection import cross_val_score, ShuffleSplit, train_test_split
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.model_selection import KFold, cross_val_score, train_test_split

import keras
from keras.layers import Dense
from keras.models import Sequential
from keras.optimizers import Adam
from keras.callbacks import EarlyStopping
from keras.utils import np_utils
from keras.layers import LSTM

data_date = max([fn[-11:-1] for fn in glob.glob("../rawdata/realdata_*/")])
ADMISSIONS_DATA_PATH = f"../rawdata/realdata_{data_date}/"
OUTPUT_PATH = f"../rawdata/shortterm/{data_date.replace('_', '-')}/"

CSSE_CASES_URL = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_US.csv"

hospital_names_abr = ["BMC", "HCGH", "JHH", "SH", "SMH"]

hosp_admit_forecast = {}

training_period = 7
correction_period = 14

starting_date = datetime.datetime(2020,3,15)


def get_combined_forecast():
	fns1 = glob.glob("../data/forecasts-*/jhhs_forecast_active_total.csv")
	fns2 = glob.glob("../data/forecasts-*/jhhs_forecast_active_allbeds*.csv")
	fns = sorted(fns1 + fns2)

	dfs = [pd.read_csv(fn) for fn in fns]

	forecast_data = None
	for df in dfs:
		df["date"] = pd.to_datetime(df["date"])
		df = df[df.sum(axis=1)>0]
		d0 = df.date.min()
		if forecast_data is None:
			forecast_data = df
		else:
			forecast_data = forecast_data[forecast_data.date<d0].append(df)

	forecast_data = forecast_data.sort_values(by="date")
	forecast_data = forecast_data.reset_index(drop=True)

	return forecast_data


def get_admission_data():
	admit_data = pd.DataFrame(columns = ["Date"])
	for hosp in hospital_names_abr:
		path = ADMISSIONS_DATA_PATH + hosp + "CumAdmits.csv"
		hosp_admit_data = pd.read_csv(path, encoding="utf-16", sep  = "\t").T.rename(columns = {
			0 : "Date", 1 : hosp
		}).drop(columns = [2]).loc["adate":]
		hosp_admit_data["Date"] = pd.to_datetime(hosp_admit_data["Date"])
		hosp_admit_data[hosp] = pd.to_numeric(hosp_admit_data[hosp])

		admit_data = admit_data.merge(hosp_admit_data, on = "Date", how = "outer", sort = True)

	dates = pd.date_range(admit_data.Date.iloc[0], admit_data.Date.iloc[-1]).to_frame(index=False, name="Date")

	admit_data = admit_data.merge(dates, on = "Date", how = "outer", sort = True)
	admit_data = admit_data.fillna(0)

	admit_data["system"] = admit_data.loc[:,"BMC":"SMH"].sum(axis=1)
	for hosp in hospital_names_abr:
		admit_data[hosp+"_7day"] = admit_data[hosp].rolling(7).mean()
	admit_data = admit_data.fillna(0)
	admit_data["system_7day"] = admit_data.loc[:,"BMC_7day":"SMH_7day"].sum(axis=1)
	return admit_data

hosp_admission = get_admission_data()


def get_occupancy_data():
	occupancy_data_path = ADMISSIONS_DATA_PATH+"CensusWorksheet.csv"
	occupancy_data_df = pd.read_csv(occupancy_data_path, encoding="utf-16", sep  = "\t")
	occupancy_data_df = occupancy_data_df[["CalcInstitutionName","Day of adate","CensusCount"]]
	occupancy_data_df = occupancy_data_df.rename(columns = {"CalcInstitutionName":"Hospital", "Day of adate":"Date", "CensusCount":"Occupancy"})
	occupancy_data_df["Date"] = pd.to_datetime(occupancy_data_df["Date"])

	occupancy_data = pd.DataFrame(columns = ["Date"])
	for hosp,hosp_df in occupancy_data_df.groupby("Hospital"):
		hosp_name = hosp.split()[0]
		hosp_data = hosp_df.drop(columns = ["Hospital"]).rename(columns={"Occupancy":hosp_name})
		occupancy_data = occupancy_data.merge(hosp_data, on = "Date", how = "outer", sort = True)

	dates = pd.date_range(occupancy_data.Date.iloc[0], occupancy_data.Date.iloc[-1]).to_frame(index=False, name="Date")
	occupancy_data = occupancy_data.merge(dates, on = "Date", how = "outer", sort = True)
	occupancy_data = occupancy_data.fillna(0)

	for hosp in hospital_names_abr:
		occupancy_data[hosp+"_7day"] = occupancy_data[hosp].rolling(7).mean()
	occupancy_data = occupancy_data.fillna(0)

	return occupancy_data


def get_ICU_occupancy_data():
	occupancy_data_path = ADMISSIONS_DATA_PATH+"ICUCensus.csv"
	occupancy_data_df = pd.read_csv(occupancy_data_path, encoding="utf-16", sep  = "\t")
	occupancy_data_df = occupancy_data_df[["CalcInstitutionName","Day of adate","CensusICUCount"]]
	occupancy_data_df = occupancy_data_df.rename(columns = {"CalcInstitutionName":"Hospital", "Day of adate":"Date", "CensusICUCount":"Occupancy"})
	occupancy_data_df["Date"] = pd.to_datetime(occupancy_data_df["Date"])

	occupancy_data = pd.DataFrame(columns = ["Date"])
	for hosp,hosp_df in occupancy_data_df.groupby("Hospital"):
		hosp_name = hosp.split()[0]
		hosp_data = hosp_df.drop(columns = ["Hospital"]).rename(columns={"Occupancy":hosp_name})
		occupancy_data = occupancy_data.merge(hosp_data, on = "Date", how = "outer", sort = True)

	dates = pd.date_range(occupancy_data.Date.iloc[0], occupancy_data.Date.iloc[-1]).to_frame(index=False, name="Date")
	occupancy_data = occupancy_data.merge(dates, on = "Date", how = "outer", sort = True)
	occupancy_data = occupancy_data.fillna(0)

	for hosp in hospital_names_abr:
		occupancy_data[hosp+"_7day"] = occupancy_data[hosp].rolling(7).mean()
	occupancy_data = occupancy_data.fillna(0)

	return occupancy_data


def get_acute_occupancy_data():
	return (get_occupancy_data().set_index(["Date"]) - get_ICU_occupancy_data().set_index(["Date"])).reset_index().dropna()


def get_state_cases_data():
	cases_data = pd.read_csv(CSSE_CASES_URL)
	cases_data = cases_data[cases_data["Province_State"]=="Maryland"].sum(axis=0).iloc[11:].reset_index().rename(columns = {"index":"dates", 0:"cum_cases"})
	cases_data["cases"] = cases_data["cum_cases"].diff(1).fillna(0)
	cases_data["7day_cases"] = cases_data["cases"].rolling(7).mean()
	cases_data["dates"] = pd.to_datetime(cases_data["dates"])
	return cases_data


def get_county_cases_data(fips_list):
	cases_data = pd.read_csv(CSSE_CASES_URL)
	cases_data = cases_data[cases_data.FIPS.isin(fips_list)].sum(axis=0).iloc[11:].reset_index().rename(columns = {"index":"dates", 0:"county_cum_cases"})
	cases_data["county_cases"] = cases_data["county_cum_cases"].diff(1).fillna(0)
	cases_data["county_7day_cases"] = cases_data["county_cases"].rolling(7).mean()
	cases_data["dates"] = pd.to_datetime(cases_data["dates"])
	return cases_data


def get_county_cases_dict():
	county_cases_dict = {}
	county_cases_dict["BMC"] = get_county_cases_data([24510])
	county_cases_dict["HCGH"] = get_county_cases_data([24027])
	county_cases_dict["JHH"] = get_county_cases_data([24510])
	county_cases_dict["SH"] = get_county_cases_data([24031])
	county_cases_dict["SMH"] = get_county_cases_data([11001])
	county_cases_dict["system"] = get_county_cases_data([24510,24027,24031,11001])
	return county_cases_dict


def get_hosp_admit_forecast(scenario,forecast_data, admit_data):
	hosp_admit_forecast = {}
	for hosp in ["BMC", "HCGH", "JHH", "SH", "SMH"]:
		hosp_admit_forecast[hosp] = {
			"real" : {
				"dates" : admit_data["Date"],
				"admissions" : admit_data[hosp],
				"7day_admissions" : admit_data[hosp+"_7day"]
			},
			"forecast":{
				"dates" : forecast_data["date"],
				"admissions": forecast_data[hosp+"_"+scenario],
				"7day_admissions": forecast_data[hosp+"_"+scenario].rolling(7).mean(),
				"3day_admissions": forecast_data[hosp+"_"+scenario].rolling(3).mean()
			},
			"corrected_forecast":{
				"dates" : forecast_data["date"],
				"admissions": forecast_data[hosp+"_"+scenario],
				# "7day_admissions": forecast_data[hosp+"_moderate"].rolling(7, center=True).mean(),
				# "3day_admissions": forecast_data[hosp+"_moderate"].rolling(3, center=True).mean()
			}
		}
	return hosp_admit_forecast


def add_sys_admit_forecast(hosp_admit_forecast):

	first_hosp = hosp_admit_forecast[next(iter(hosp_admit_forecast))]
	admission_dates = first_hosp["real"]["dates"]
	forecast_dates = first_hosp["forecast"]["dates"]

	system = {
		"real" : {
			"dates" : admission_dates,
			"admissions" : np.zeros(len(admission_dates)),
			"7day_admissions" : np.zeros(len(admission_dates))
		},
		"forecast":{
			"dates" : forecast_dates,
			"admissions": np.zeros(len(forecast_dates)),
			"7day_admissions": np.zeros(len(forecast_dates)),
			"3day_admissions": np.zeros(len(forecast_dates))
		},
		"corrected_forecast":{
			"dates" : forecast_dates,
			"admissions": np.zeros(len(forecast_dates)),
			# "7day_admissions": forecast_data[hosp+"_moderate"].rolling(7, center=True).mean(),
			# "3day_admissions": forecast_data[hosp+"_moderate"].rolling(3, center=True).mean()
		}
	}
	for hosp, data in hosp_admit_forecast.items():
		for series_name ,series in system.items():
			for key in series.keys():
				if key!="dates":
					series[key] += hosp_admit_forecast[hosp][series_name][key]

	hosp_admit_forecast["system"] = system
	return hosp_admit_forecast


def get_data_table(data, county_cases):
	first_date = starting_date
	last_date = min(pd.DataFrame(data["real"])["dates"].iloc[-1],hosp_admission["Date"].iloc[-1]) + datetime.timedelta(days=correction_period)
	table = pd.DataFrame(data["real"])
	table = table.merge(pd.DataFrame(data["forecast"]), on = "dates", how = "outer")

	table = table.merge(state_cases_data, on = "dates", how = "left")
	table = table.merge(county_cases, on = "dates", how = "left")

	table["forecast_diff"] = (table["admissions_x"]-table["admissions_y"]).abs()
	table["day"] = pd.Series([i for i in range(len(table))])
	table["day"] = table["day"]%7
	table = table[table["dates"]>= first_date]
	table = table[table["dates"]<= last_date]
	return table.fillna(0)


def get_training_target_11(data,hosp):
	training = []
	target = []

	county_cases = county_cases_dict[hosp]
	table = get_data_table(data, county_cases)
	table_list = []
	dates = []

	for i in range(training_period+1,len(table)-2*correction_period):
		training.append(
			(table["7day_admissions_x"].iloc[i-training_period:i].values-table["7day_admissions_x"].shift().iloc[i-training_period:i].values).tolist()
			+(hosp_admission[hosp_admission.Date.isin(table["dates"].iloc[i-training_period:i])][hosp+"_7day"].values - hosp_admission[hosp_admission.Date.isin(table["dates"].shift().iloc[i-training_period:i])][hosp+"_7day"].values).tolist()
		)
		target.append(
			(table["7day_admissions_x"]).iloc[i:i+correction_period]- (table["7day_admissions_x"]).shift().iloc[i:i+correction_period]
		)
		table_list.append(table.iloc[i-training_period:i+correction_period+1].reset_index())
		dates.append(table["dates"].iloc[i])
	return training, target, table_list, dates


def get_prediction_input_11(data, hosp):
	pred_input = []
	county_cases = county_cases_dict[hosp]
	table = get_data_table(data, county_cases)
	table_list = []
	dates = []

	for i in range(len(table)-2*correction_period,len(table)-correction_period+1):
		pred_input.append(
			(table["7day_admissions_x"].iloc[i-training_period:i].values-table["7day_admissions_x"].shift().iloc[i-training_period:i].values).tolist()
			+(hosp_admission[hosp_admission.Date.isin(table["dates"].iloc[i-training_period:i])][hosp+"_7day"].values - hosp_admission[hosp_admission.Date.isin(table["dates"].shift().iloc[i-training_period:i])][hosp+"_7day"].values).tolist()
		)
		table_list.append(table.iloc[i-training_period:i+correction_period+1].reset_index())
		dates.append(table["dates"].iloc[i])
	return pred_input, table_list, dates


forecast_list = [get_combined_forecast()]

occupancy_data = get_occupancy_data()
ICU_occupancy_data = get_ICU_occupancy_data()
acute_occupancy_data = get_acute_occupancy_data()

occupancy = {
	"total" : occupancy_data,
	"ICU" : ICU_occupancy_data,
	"acute": acute_occupancy_data
}

state_cases_data = get_state_cases_data()
county_cases_dict = get_county_cases_dict()


def split_training_testing_date_i(training_target, date_i):
	training = []
	target = []
	data_table_list = []
	data_list = []
	train_indices = []
	test_indices = []

	dates = [date for date in training_target]

	training_dates, testing_dates = dates[:date_i-correction_period], [dates[date_i]]

	for date in training_target:
		if date in training_dates:
			train_indices.extend(np.array([ind for ind in range(len(training_target[date]["training"]))])+len(training))
		elif date in testing_dates:
			test_indices.extend(np.array([ind for ind in range(len(training_target[date]["target"]))])+len(target))

		training += training_target[date]["training"]
		target += training_target[date]["target"]
		data_table_list += training_target[date]["data_table"]
		data_list += training_target[date]["data"]

	return np.array(training), np.array(target), data_table_list, data_list, train_indices, test_indices


def split_training_testing_date_i_2s(training_target, date_i):
	training = []
	target = []
	data_table_list = []
	data_list = []
	train_indices = []
	test_indices = []

	dates = [date for date in training_target]

	training_dates, testing_dates = dates[:date_i-7]+dates[date_i+7:], [dates[date_i]]

	for date in training_target:
		if date in training_dates:
			train_indices.extend(np.array([ind for ind in range(len(training_target[date]["training"]))])+len(training))
		elif date in testing_dates:
			test_indices.extend(np.array([ind for ind in range(len(training_target[date]["target"]))])+len(target))

		training += training_target[date]["training"]
		target += training_target[date]["target"]
		data_table_list += training_target[date]["data_table"]
		data_list += training_target[date]["data"]

	return np.array(training), np.array(target), data_table_list, data_list, train_indices, test_indices


def get_training_target_prediction(tr_period, corr_period, admit_data):

	training_period = tr_period
	correction_period = corr_period

	training_target_sets = {hosp: {} for hosp in ["BMC", "HCGH", "JHH", "SH", "SMH", "system"]}
	prediction_sets = {hosp: {} for hosp in ["BMC", "HCGH", "JHH", "SH", "SMH", "system"]}

	get_training = get_training_target_11
	get_pred = get_prediction_input_11

	for forecast_data in forecast_list:
		hosp_admit_forecast = get_hosp_admit_forecast("moderate",forecast_data,admit_data)
		hosp_admit_forecast = add_sys_admit_forecast(hosp_admit_forecast)
		for hosp, data in hosp_admit_forecast.items():
			training, target, data_table, dates = get_training(data,hosp)
			for i in range(len(dates)):
				if dates[i] in training_target_sets[hosp]:
					training_target_sets[hosp][dates[i]]["training"].append(training[i])
					training_target_sets[hosp][dates[i]]["target"].append(target[i])
					training_target_sets[hosp][dates[i]]["data_table"].append(data_table[i])
					training_target_sets[hosp][dates[i]]["data"].append(data)
				else:
					training_target_sets[hosp][dates[i]] = {"training":[training[i]], "target":[target[i]], "data_table":[data_table[i]], "data":[data]}

			pred_input, data_table, dates = get_pred(data,hosp)
			for i in range(len(dates)):
				if dates[i] in prediction_sets[hosp]:
					prediction_sets[hosp][dates[i]]["pred_input"].append(pred_input[i])
					prediction_sets[hosp][dates[i]]["data_table"].append(data_table[i])
					prediction_sets[hosp][dates[i]]["data"].append(data)
				else:
					prediction_sets[hosp][dates[i]] = {"pred_input": [pred_input[i]], "data_table":[data_table[i]], "data":[data]}
	return training_target_sets, prediction_sets

training_target_sets, prediction_sets = get_training_target_prediction(training_period, correction_period,occupancy_data)


def get_corrected(training_target_sets, prediction_sets):
	errors_table = []
	error_dates_list = []
	corrected_dates = []
	corrected_forecasts = []
	prediction_dates = []
	prediction_forecasts = []

	for hosp, training_target in training_target_sets.items():

			training, target, data_table_list, data_list, indices_train, indices_test = [],[],[],[],[],[]
			dates = list(training_target.keys())
			errors = []
			error_dates = []
			for date_i in range(len(dates)-90, len(dates)):
				training, target, data_table_list, data_list, indices_train, indices_test = split_training_testing_date_i(training_target, date_i)
				X_train, X_test, y_train, y_test = training[indices_train], training[indices_test], target[indices_train], target[indices_test]
				reg = RandomForestRegressor(n_estimators=500, max_depth=40).fit(X_train, y_train)
				pred = reg.predict(X_test)

				for i in range(0,len(pred),1):
					first_date_ind = 0
					mid_date_ind = training_period
					last_date_ind = training_period+correction_period

					table = data_table_list[indices_test[i]]
					data = data_list[indices_test[i]]
					corrected = pred.ravel().cumsum() + table["7day_admissions_x"].shift().iloc[mid_date_ind]
					corrected_forecasts.append(corrected.copy())
					corrected_dates.append(table["dates"].iloc[mid_date_ind:mid_date_ind+len(pred.ravel())].copy())

			for date, pred_data in prediction_sets[hosp].items():
				table = pred_data["data_table"][0].reset_index()
				data = pred_data["data"][0]
				reg = RandomForestRegressor(n_estimators=500, max_depth=40).fit(training, target)
				inpt = np.array(pred_data["pred_input"][0])
				pred = reg.predict(inpt.reshape(1, -1))

				for i in range(0,len(pred.reshape(1, -1)),1):
					first_date_ind = 0
					mid_date_ind = training_period
					last_date_ind = training_period+correction_period
					corrected = pred.ravel().cumsum() + table["7day_admissions_x"].shift().iloc[mid_date_ind]
					prediction_forecasts.append(corrected.copy())
					prediction_dates.append(table["dates"].iloc[mid_date_ind:mid_date_ind+len(pred.ravel())].copy())

	return corrected_forecasts, corrected_dates, prediction_forecasts, prediction_dates


def extract_predictions(ens_corrected_forecasts, ens_corrected_dates, ens_prediction_forecasts, ens_prediction_dates):
	ens_prediction_dates[7]
	number_of_preds = len(ens_prediction_forecasts[7])//6

	predictions = {}
	for i, hosp in enumerate(hospital_names_abr):
		predictions[hosp] = {
			"dates" : ens_prediction_dates[7][i*number_of_preds:(i+1)*number_of_preds],
			"preds" : ens_prediction_forecasts[7][i*number_of_preds:(i+1)*number_of_preds]
		}
	return predictions


def save_output(name, predictions):
	df = pd.DataFrame(pd.Series(predictions["BMC"]["dates"][-1],name = "date")).reset_index()
	for hosp in hospital_names_abr:
		df[hosp] = predictions[hosp]["preds"][-1]
	df.to_csv(OUTPUT_PATH+"occupancy"+name.lower()+".csv",index=False)


def ensemble(occupancy):
	ensemble_training_target_sets = []
	ensemble_prediction_sets = []
	ens_corrected_forecasts, ens_corrected_dates, ens_prediction_forecasts, ens_prediction_dates = {},{},{},{}
	for tr,corr in [(2*i,i) for i in range(7,8)]:
		training_target_sets, prediction_sets = get_training_target_prediction(tr,corr,occupancy)
		ensemble_training_target_sets.append(training_target_sets)
		ensemble_prediction_sets.append(prediction_sets)
		corrected_forecasts, corrected_dates, prediction_forecasts, prediction_dates = get_corrected(training_target_sets, prediction_sets)
		ens_corrected_forecasts[corr] = corrected_forecasts
		ens_corrected_dates[corr] = corrected_dates
		ens_prediction_forecasts[corr] = prediction_forecasts
		ens_prediction_dates[corr] = prediction_dates
	return ens_corrected_forecasts, ens_corrected_dates, ens_prediction_forecasts, ens_prediction_dates

for name, occ_data in occupancy.items():
	ens_corrected_forecasts, ens_corrected_dates, ens_prediction_forecasts, ens_prediction_dates = ensemble(occ_data)
	predictions = extract_predictions(ens_corrected_forecasts, ens_corrected_dates, ens_prediction_forecasts, ens_prediction_dates)
	save_output(name, predictions)
