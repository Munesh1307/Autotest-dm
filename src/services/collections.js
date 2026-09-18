import { deleteApi, getApi, postApi, putApi } from "./methods";

const LOGIN_REGISTER = "admin/login";
const FORGOT_PASSWORD = "admin/forgot-password";
const RESET_PASSWORD = "admin/reset-password";
const CREATE_COUNTIES = "counties/create-county";
const GET_COUNTIESLIST = "counties/get-counties-list";
const COUNTIES_GET_FILTER = "counties/get-unique-states-list";
const GET_FILTER_COUNT = "counties/get-states-counts";
const GET_FILTER_CONDIDATE_COUNT = "candidates/get-candidates-counts";
const DELETE_COUNTIES = "counties/delete-county";
const COUNTIES_VIEW = "counties/get-county-by-id";
const CREATE_UPDATE = "candidates/create-candidate";
const GET_OFFICE_LISTING = "candidates/get-all-offices";
const GET_COUNTIES_LISTING = "counties/get-county-listing";
const GET_ALL_CONDIDATE_LISTING = "candidates/get-all-candidates-listing";
const DELETE_CONDIDATE = "candidates/delete-candidate";
const CONDIDATE_VIEW = "candidates/get-candidate-by-id";
const CONDIDATE_UPDATE = "candidates/update-candidate";
const ADMIN_UPDATE = "admin/update-profile";
const GET_ISSUE_CATEGORIES = "issues/get-unique-categories";
const CREATE_ISSUE = "issues/create-issue";
const GET_ISSUE_LISTING = "issues/get-dashboard-issues-listing";
const UPDATE_ISSUE = "issues/update-issue";
const ISSUE_GET_COUNT = "issues/get-dashboard-issues-counts";
const ISSUE_VIEW = "issues/get-issue-by-id";
const DELETE_ISSUE = "issues/delete-issue";
const ADD_POLLS = "polls/add-poll";
const GET_POLLS_LISTING = "polls/get-polls-listing";
const DELETE_POLLS = "polls/delete-poll";
const UPDATE_POLLS = "polls/update-poll";
const CREATE_OFFICE = "candidates/create-office";
const GET_ALL_OFFICE_LISTING = "candidates/get-offices-listing";
const DELETE_OFFICE = "candidates/delete-office";
const UPDATE_OFFICE = "candidates/update-office";
const OFFICE_FILTER_COUNT = "candidates/get-offices-level-counts";
const DELETE_MULTIPLE_CANDIDATES = "candidates/multiple-delete-candidates";
const DELETE_MULTIPLE_COUNTIES = "counties/multiple-delete-counties";
const DELETE_MULTIPLE_ISSUES = "issues/multiple-delete-issues";
const DELETE_MULTIPLE_POLLS = "polls/multiple-delete-polls";
const GET_APP_USER_LIST = "/admin/users-with-poll-data";
const DELETE_APP_USER = "/admin/users";
const GET_APP_USER_PROFILE = "/admin/users-profile";
const GET_APP_USER_VOTED_POLLS = "/admin/users-voted-polls";
const UPDATE_APP_USER_PROFILE = "/admin/update-user-profile";
const DELETE_APP_USER_MULTIPLE = "/admin/delete-multiple-users";
const CHANGE_PASSWORD = "/admin/change-password";
const CREATE_POLLING_LOCATION = "/polling-locations/create-polling-location";
const GET_POLLING_LOCATION_LISTING =
  "/polling-locations/get-polling-locations-listing";
const DELETE_POLLING_LOCATION = "/polling-locations/delete-polling-location";
const DELETE_MULTIPLE_POLLING_LOCATION =
  "/polling-locations/multiple-delete-polling-locations";
const GET_POLLING_LOCATION_BY_ID =
  "/polling-locations/get-polling-location-by-id";
const DELETE_MULTIPLE_OFFICES = "/candidates/multiple-delete-offices";

const IMPORT_CANDIDATE_DATA = "/candidates/import-candidates";
const DOWNLOAD_OFFICE_IMPORT_TEMPLATE = "/candidates/download-office-template";
const IMPORT_OFFICE_DATA = "/candidates/import-offices";
const DOWNLOAD_ISSUE_IMPORT_TEMPLATE = "/issues/download-issue-template";
const IMPORT_ISSUE_DATA = "/issues/import-issues";
const DOWNLOAD_COUNTY_IMPORT_TEMPLATE = "/counties/download-county-template";
const IMPORT_COUNTY_DATA = "/counties/import-counties";
const DELETE_MULTIPLE_POLICY = "policies/multiple-delete-policies";
const UPDATE_PUBLISH_POLICY = "policies/publish-policy";
const UPDATE_POLICY = "policies/update-policy";
const VERIFY_EMAIL = "users/verify-email";
const VERIFY_EMAIL_ADMIN = "admin/verify-email";
const RESET_PASSWORD_MOB = "users/reset-password";
const ADMIN_USER = "admin/admins";
const CREATE_ADMIN = "admin/create-admins";
const ADMIN_UPDATE_PASSWORD = "admin/change-admins-password";
const PRIVACY_POLICY = "policies/get-published-policy";
const GET_ALL_BALLOTS_LISTING = "ballots/get-all-ballots-listing";
const GET_FILTER_BALLOTS_COUNT = "ballots/get-ballot-count-by-state";
const GET_BALLOTS_CONDIDATE_LISTING = "ballots/get-candidates-for-ballot-listing";
const CREATE_BALLOT = "ballots/create-ballot";
const DELETE_BALLOTS = "ballots/delete-ballot";
const DELETE_MULTIPLE_BALLOTS = "ballots/multiple-delete-ballots";
const UPDATE_BALLOT = "ballots/update-ballot";
const BALLOTS_DATE = "ballots/set-ballot-date";
const GET_BALLOTS_DATE = "ballots/get-ballot-date";
const CONFIGURATIONS_ALL = "configurations/all";
const GET_NOTIFICATION_LIST = "notifications/list-notifications";
const DELETE_NOTIFICATION = "notifications";
const SEND_NOTIFICATION = "notifications/send-notification";

export const loginUser = (payload) => {
  return postApi(`${LOGIN_REGISTER}`, payload);
};

export const forgotpass = (payload) => {
  return postApi(`${FORGOT_PASSWORD}`, payload);
};

export const resetpass = (payload) => {
  return postApi(`${RESET_PASSWORD}`, payload);
};

export const emailVerification = (payload) => {
  return postApi(`${VERIFY_EMAIL}`, payload);
};

export const email_verification_admin = (payload) => {
  return postApi(`${VERIFY_EMAIL_ADMIN}`, payload);
};

export const resetPasswordMob = (payload) => {
  return postApi(`${RESET_PASSWORD_MOB}`, payload);
};

export const createCounties = (payload) => {
  return postApi(`${CREATE_COUNTIES}`, payload);
};

export const getCountiesList = (payload) => {
  return getApi(`${GET_COUNTIESLIST}?${payload}`);
};

export const counties_Get_Filter = () => {
  return getApi(`${COUNTIES_GET_FILTER}`);
};

export const Get_filter_count = (payload) => {
  return postApi(`${GET_FILTER_COUNT}`, payload);
};

export const delete_counties = (id) => {
  return deleteApi(`${DELETE_COUNTIES}`, { countyId: id });
};

export const counties_View = (id) => {
  return getApi(`${COUNTIES_VIEW}?countyId=${id}`);
};

export const createUpdate = (payload) => {
  return postApi(`${CREATE_UPDATE}`, payload);
};

export const get_office_listing = () => {
  return getApi(`${GET_OFFICE_LISTING}`);
};

export const get_counties_listing = () => {
  return getApi(`${GET_COUNTIES_LISTING}`);
};

export const get_all_condidate_listing = (payload) => {
  return getApi(`${GET_ALL_CONDIDATE_LISTING}?${payload}`);
};

export const delete_condidate = (id) => {
  return deleteApi(`${DELETE_CONDIDATE}`, { candidateId: id });
};

export const condidate_View = (id) => {
  return getApi(`${CONDIDATE_VIEW}?candidateId=${id}`);
};

export const Get_filter__Condidate_count = (payload) => {
  return getApi(`${GET_FILTER_CONDIDATE_COUNT}?${payload}`);
};

export const update_condidate = (payload) => {
  return putApi(`${CONDIDATE_UPDATE}`, payload);
};

export const admin_update = (payload) => {
  return putApi(`${ADMIN_UPDATE}`, payload);
};

export const get_issue_gategories = () => {
  return getApi(`${GET_ISSUE_CATEGORIES}`);
};

export const create_issue = (payload) => {
  return postApi(`${CREATE_ISSUE}`, payload);
};

export const get_issue_listing = (payload) => {
  return getApi(`${GET_ISSUE_LISTING}?${payload}`);
};

export const update_issue = (payload) => {
  return putApi(`${UPDATE_ISSUE}`, payload);
};

export const issue_count = (payload) => {
  return getApi(`${ISSUE_GET_COUNT}`, payload);
};

export const issue_View = (id) => {
  return getApi(`${ISSUE_VIEW}?issueId=${id}`);
};

export const delete_issue = (id) => {
  return deleteApi(`${DELETE_ISSUE}`, { issueId: id });
};

export const add_polls = (payload) => {
  return postApi(`${ADD_POLLS}`, payload);
};

export const get_polls_listing = (payload) => {
  return getApi(`${GET_POLLS_LISTING}?${payload}`);
};

export const delete_polls = (id) => {
  return deleteApi(`${DELETE_POLLS}`, { pollId: id });
};

export const update_polls = (payload) => {
  return putApi(`${UPDATE_POLLS}`, payload);
};

export const create_office = (payload) => {
  return postApi(`${CREATE_OFFICE}`, payload);
};

export const get_all_office_listing = (payload) => {
  return getApi(`${GET_ALL_OFFICE_LISTING}?${payload}`);
};

export const delete_office = (id) => {
  return deleteApi(`${DELETE_OFFICE}`, { officeId: id });
};

export const update_office = (payload) => {
  return putApi(`${UPDATE_OFFICE}`, payload);
};

export const office_filter_count = (payload) => {
  return getApi(`${OFFICE_FILTER_COUNT}`, payload);
};

export const getAppUserList = (payload) => {
  return getApi(`${GET_APP_USER_LIST}?${payload}`);
};

export const delete_app_user = (id) => {
  return deleteApi(`${DELETE_APP_USER}/${id}`);
};

export const deleteMultipleCandidates = (payload) => {
  return deleteApi(DELETE_MULTIPLE_CANDIDATES, payload);
};

export const deleteMultipleCounties = (payload) => {
  return deleteApi(DELETE_MULTIPLE_COUNTIES, payload);
};

export const getAppUserVotedPolls = (id, payload) => {
  return getApi(`${GET_APP_USER_VOTED_POLLS}/${id}?${payload}`);
};

export const deleteMultipleIssues = (payload) => {
  return deleteApi(DELETE_MULTIPLE_ISSUES, payload);
};

export const deleteMultiplePolls = (payload) => {
  return deleteApi(DELETE_MULTIPLE_POLLS, payload);
};

export const delete_app_user_multiple = (payload) => {
  return deleteApi(`${DELETE_APP_USER_MULTIPLE}`, payload);
};

export const getAppUserProfile = (id) => {
  return getApi(`${GET_APP_USER_PROFILE}/${id}`);
};

export const update_app_user_profile = (payload) => {
  return putApi(`${UPDATE_APP_USER_PROFILE}`, payload);
};

export const change_password = (payload) => {
  return putApi(`${CHANGE_PASSWORD}`, payload);
};

export const create_polling_location = (payload) => {
  return postApi(`${CREATE_POLLING_LOCATION}`, payload);
};

export const get_polling_location_listing = (payload) => {
  return getApi(`${GET_POLLING_LOCATION_LISTING}?${payload}`);
};

export const delete_polling_location = (id) => {
  return deleteApi(`${DELETE_POLLING_LOCATION}`, { pollingLocationId: id });
};

export const deleteMultiplePollingLocation = (payload) => {
  return deleteApi(DELETE_MULTIPLE_POLLING_LOCATION, payload);
};

export const get_polling_location_by_id = (id) => {
  return getApi(`${GET_POLLING_LOCATION_BY_ID}?pollingLocationId=${id}`);
};

export const deleteMultipleOffices = (payload) => {
  return deleteApi(DELETE_MULTIPLE_OFFICES, payload);
};

export const import_candidate_data = (payload) => {
  return postApi(`${IMPORT_CANDIDATE_DATA}`, payload);
};

export const office_template = () => {
  return getApi(`${DOWNLOAD_OFFICE_IMPORT_TEMPLATE}`);
};

export const import_office_data = (payload) => {
  return postApi(`${IMPORT_OFFICE_DATA}`, payload);
};

export const issue_template = () => {
  return getApi(`${DOWNLOAD_ISSUE_IMPORT_TEMPLATE}`);
};

export const import_issue_data = (payload) => {
  return postApi(`${IMPORT_ISSUE_DATA}`, payload);
};

export const county_template = () => {
  return getApi(`${DOWNLOAD_COUNTY_IMPORT_TEMPLATE}`);
};

export const import_county_data = (payload) => {
  return postApi(`${IMPORT_COUNTY_DATA}`, payload);
};

export const deleteMultiplepolicy = (payload) => {
  return deleteApi(DELETE_MULTIPLE_POLICY, payload);
};

export const update_publish_policy = (payload) => {
  return putApi(`${UPDATE_PUBLISH_POLICY}?${payload}`);
};

export const update_policy = (payload) => {
  return putApi(`${UPDATE_POLICY}`, payload);
};

export const getAdminUserData = (payload) => {
  return getApi(`${ADMIN_USER}?${payload}`);
};

export const Add_Admin_user = (payload) => {
  return postApi(`${CREATE_ADMIN}`, payload);
};

export const Admin_Update_password = (id, payload) => {
  return putApi(`${ADMIN_UPDATE_PASSWORD}/${id}`, payload);
};

export const get_privacy_policy = () => {
  return getApi(`${PRIVACY_POLICY}`);
};

export const get_all_ballots_listing = (payload) => {
  return getApi(`${GET_ALL_BALLOTS_LISTING}?${payload}`);
};

export const Get_filter__ballots_count = (payload) => {
  return getApi(`${GET_FILTER_BALLOTS_COUNT}?${payload}`);
};

export const get_ballot_condidate_listing = (payload) => {
  return getApi(`${GET_BALLOTS_CONDIDATE_LISTING}?${payload}`);
};

export const create_ballot = (payload) => {
  return postApi(`${CREATE_BALLOT}`, payload);
};

export const delete_ballots = (id) => {
  return deleteApi(`${DELETE_BALLOTS}`, { ballotId: id });
};

export const deleteMultipleBallots = (payload) => {
  return deleteApi(DELETE_MULTIPLE_BALLOTS, payload);
};

export const update_ballot = (payload) => {
  return putApi(`${UPDATE_BALLOT}`, payload);
};

export const ballot_date = (payload) => {
  return postApi(`${BALLOTS_DATE}`, payload);
};

export const get_ballot_date = () => {
  return getApi(`${GET_BALLOTS_DATE}`);
};

export const get_configurations_all = () => {
  return getApi(`${CONFIGURATIONS_ALL}`);
};

export const get_notification_listing = (payload) => {
  return getApi(`${GET_NOTIFICATION_LIST}?${payload}`);
};

export const delete_notification = (id) => {
  return deleteApi(`${DELETE_NOTIFICATION}/${id}`, { notificationId: id });
};

export const send_notification = (payload) => {
  return postApi(`${SEND_NOTIFICATION}`, payload);
};
