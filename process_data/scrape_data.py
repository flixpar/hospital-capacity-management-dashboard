from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as ec

import time
import getpass
from datetime import datetime

import os
os.environ["PATH"] += os.pathsep + "./"


def main():
	datestr = datetime.today().strftime("%Y_%m_%d")
	outfolder = f"../rawdata/realdata_{datestr}"

	if not os.path.exists(outfolder):
		os.mkdir(outfolder)

	options = webdriver.ChromeOptions()
	options.add_experimental_option("prefs", {
		"download.default_directory": os.path.normpath(f"{os.getcwd()}/{outfolder}"),
		"download.prompt_for_download": False,
		"download.directory_upgrade": True,
	})
	driver = webdriver.Chrome(options=options)

	login(driver)
	download_admissions(driver, outfolder)
	download_occupancy(driver, outfolder)

	driver.quit()
	return

def login(driver):
	driver.get("https://tableau.jhmi.edu")

	WebDriverWait(driver, 20).until(ec.any_of(
		ec.title_is("Home - Tableau Server"),
		ec.presence_of_element_located((By.ID, "i0116")),
	))

	if "https://login.microsoftonline.com/"  not in driver.current_url:
		return

	email = "fparker9@jh.edu"
	password = getpass.getpass()

	email_input = driver.find_element(By.ID, "i0116")
	email_input.send_keys(email)

	next_btn_1 = driver.find_element(By.ID, "idSIButton9")
	next_btn_1.click()

	WebDriverWait(driver, 10).until(ec.presence_of_element_located((By.ID, "i0118")))

	pass_input = driver.find_element(By.ID, "i0118")
	pass_input.send_keys(password)

	time.sleep(1.5)

	signin_button = driver.find_element(By.ID, "idSIButton9")
	signin_button.click()

	WebDriverWait(driver, 20).until(ec.title_is("Home - Tableau Server"))

	return

def waitforload(driver):
	time.sleep(5)
	WebDriverWait(driver, 15).until(ec.invisibility_of_element_located((By.ID, "loadingGlassPane")))
	return

def download_admissions(driver, outfolder):
	driver.get("https://tableau.jhmi.edu/#/site/JHMEnterpriseAnalytics/views/COVID-19CensusPositivityDashboard/CumulativeAdmissions")

	# wait for iframe to load and switch to it
	WebDriverWait(driver, 30).until(ec.presence_of_element_located((By.CSS_SELECTOR, "#viz > iframe")))
	WebDriverWait(driver, 30).until(ec.frame_to_be_available_and_switch_to_it((By.CSS_SELECTOR, "#viz > iframe")))

	WebDriverWait(driver, 20).until(ec.all_of(
		ec.presence_of_element_located((By.ID, "tabZoneId69")),
		ec.presence_of_element_located((By.ID, "dijit_form_ToggleButton_0_label"))
	))

	hospital_select = driver.find_element(By.ID, "tabZoneId66")
	dtype_select = driver.find_element(By.ID, "tabZoneId68")
	date_select = driver.find_element(By.ID, "tabZoneId69")
	icu_select = driver.find_element(By.ID, "tabZoneId70")

	# set date range
	date_select.click()
	driver.find_element(By.ID, "dijit_form_ToggleButton_0_label").click()

	waitforload(driver)

	# set to daily admissions
	dtype_select.click()
	dtype_elems = driver.find_element(By.CLASS_NAME, "tabMenuContent").find_elements(By.CLASS_NAME, "tabMenuItemNameArea")
	dtype_elems[1].click()

	waitforload(driver)

	hospitals = ["BMC", "HCGH", "JHH", "SH", "SMH"]

	for icu in [False, True]:
		icu_select.click()
		icu_elems = driver.find_element(By.CLASS_NAME, "tabMenuContent").find_elements(By.CLASS_NAME, "tabMenuItemNameArea")
		if icu:
			icu_elems[0].click()
		else:
			icu_elems[1].click()

		waitforload(driver)

		for h_name in hospitals:
			# select hospital
			hospital_select.click()
			hospital_elems = driver.find_element(By.CLASS_NAME, "tabMenuContent").find_elements(By.CLASS_NAME, "tabMenuItemNameArea")
			h_elem = [el for el in hospital_elems if el.text.split(" ")[0] == h_name][0]
			h_elem.click()

			waitforload(driver)

			download_btn = driver.find_element(By.ID, "download-ToolbarButton")
			download_btn.click()

			# set download type to crosstab
			WebDriverWait(driver, 10).until(ec.presence_of_element_located((By.CSS_SELECTOR, "button[data-tb-test-id='DownloadCrosstab-Button']")))
			driver.find_element(By.CSS_SELECTOR, "button[data-tb-test-id='DownloadCrosstab-Button']").click()

			# set download file type to csv
			WebDriverWait(driver, 10).until(ec.presence_of_element_located((By.CSS_SELECTOR, "label[data-tb-test-id='crosstab-options-dialog-radio-csv-Label']")))
			driver.find_element(By.CSS_SELECTOR, "label[data-tb-test-id='crosstab-options-dialog-radio-csv-Label']").click()

			# select sheet to download
			sheet_select = driver.find_element(By.CSS_SELECTOR, "div[aria-label='Single Sheet Selection']")
			sheet_options_elems = sheet_select.find_elements(By.XPATH, "*")
			sheet_option_names = [s.find_element(By.TAG_NAME, "span").text for s in sheet_options_elems]
			selected_sheet_name = h_name + "CumAdmits"
			selected_sheet_index = sheet_option_names.index(selected_sheet_name)
			selected_sheet_elem = sheet_options_elems[selected_sheet_index]
			if not selected_sheet_elem.get_attribute("aria-selected") == "true":
				selected_sheet_elem.click()

			# download
			driver.find_element(By.CSS_SELECTOR, "button[data-tb-test-id='export-crosstab-export-Button']").click()

			time.sleep(1)

	time.sleep(3)
	for h in hospitals:
		os.rename(f"{outfolder}/{h}CumAdmits.csv", f"{outfolder}/{h}Admits.csv")
		os.rename(f"{outfolder}/{h}CumAdmits (1).csv", f"{outfolder}/{h}AdmitsICU.csv")

	return

def download_occupancy(driver, outfolder):
	driver.get("https://tableau.jhmi.edu/#/site/JHMEnterpriseAnalytics/views/COVID-19CensusPositivityDashboard/Census")

	# wait for iframe to load and switch to it
	WebDriverWait(driver, 30).until(ec.presence_of_element_located((By.CSS_SELECTOR, "#viz > iframe")))
	WebDriverWait(driver, 30).until(ec.frame_to_be_available_and_switch_to_it((By.CSS_SELECTOR, "#viz > iframe")))

	WebDriverWait(driver, 20).until(ec.presence_of_element_located((By.ID, "tabZoneId46")))

	date_select = driver.find_element(By.ID, "tabZoneId46")
	active_select = driver.find_element(By.ID, "tabZoneId45")

	# set date range
	date_select.click()
	driver.find_element(By.ID, "dijit_form_ToggleButton_0_label").click()

	waitforload(driver)

	for active in [False, True]:
		active_select.click()
		active_elems = driver.find_element(By.CLASS_NAME, "tabMenuContent").find_elements(By.CLASS_NAME, "tabMenuItemNameArea")
		if active:
			active_elems[1].click()
		else:
			active_elems[0].click()

		waitforload(driver)

		for icu in [False, True]:
			selected_sheet_name = "CensusWorksheet" if not icu else "NoonCensus (ICU)"

			download_btn = driver.find_element(By.ID, "download-ToolbarButton")
			download_btn.click()

			# set download type to crosstab
			WebDriverWait(driver, 10).until(ec.presence_of_element_located((By.CSS_SELECTOR, "button[data-tb-test-id='DownloadCrosstab-Button']")))
			driver.find_element(By.CSS_SELECTOR, "button[data-tb-test-id='DownloadCrosstab-Button']").click()

			# set download file type to csv
			WebDriverWait(driver, 10).until(ec.presence_of_element_located((By.CSS_SELECTOR, "label[data-tb-test-id='crosstab-options-dialog-radio-csv-Label']")))
			driver.find_element(By.CSS_SELECTOR, "label[data-tb-test-id='crosstab-options-dialog-radio-csv-Label']").click()

			# select sheet to download
			sheet_select = driver.find_element(By.CSS_SELECTOR, "div[aria-label='Single Sheet Selection']")
			sheet_options_elems = sheet_select.find_elements(By.XPATH, "*")
			sheet_option_names = [s.find_element(By.TAG_NAME, "span").text for s in sheet_options_elems]
			selected_sheet_index = sheet_option_names.index(selected_sheet_name)
			selected_sheet_elem = sheet_options_elems[selected_sheet_index]
			if not selected_sheet_elem.get_attribute("aria-selected") == "true":
				selected_sheet_elem.click()

			# download
			driver.find_element(By.CSS_SELECTOR, "button[data-tb-test-id='export-crosstab-export-Button']").click()

			time.sleep(3)

	time.sleep(3)
	os.rename(f"{outfolder}/CensusWorksheet.csv", f"{outfolder}/Occupancy.csv")
	os.rename(f"{outfolder}/CensusWorksheet (1).csv", f"{outfolder}/OccupancyActive.csv")
	os.rename(f"{outfolder}/NoonCensus (ICU).csv", f"{outfolder}/OccupancyICU.csv")
	os.rename(f"{outfolder}/NoonCensus (ICU) (1).csv", f"{outfolder}/OccupancyICUActive.csv")

	return

if __name__ == "__main__":
	main()
