const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'tmflow',
  service: 'tmflow',
  location: 'europe-west1'
};
exports.connectorConfig = connectorConfig;

const registerUserRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'RegisterUser', inputVars);
}
registerUserRef.operationName = 'RegisterUser';
exports.registerUserRef = registerUserRef;

exports.registerUser = function registerUser(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(registerUserRef(dcInstance, inputVars));
}
;

const createTenderRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateTender', inputVars);
}
createTenderRef.operationName = 'CreateTender';
exports.createTenderRef = createTenderRef;

exports.createTender = function createTender(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(createTenderRef(dcInstance, inputVars));
}
;

const updateTenderRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateTender', inputVars);
}
updateTenderRef.operationName = 'UpdateTender';
exports.updateTenderRef = updateTenderRef;

exports.updateTender = function updateTender(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateTenderRef(dcInstance, inputVars));
}
;

const deleteTenderRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteTender', inputVars);
}
deleteTenderRef.operationName = 'DeleteTender';
exports.deleteTenderRef = deleteTenderRef;

exports.deleteTender = function deleteTender(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteTenderRef(dcInstance, inputVars));
}
;

const completeOnboardingRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CompleteOnboarding');
}
completeOnboardingRef.operationName = 'CompleteOnboarding';
exports.completeOnboardingRef = completeOnboardingRef;

exports.completeOnboarding = function completeOnboarding(dc) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dc, undefined);
  return executeMutation(completeOnboardingRef(dcInstance, inputVars));
}
;

const meRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'Me');
}
meRef.operationName = 'Me';
exports.meRef = meRef;

exports.me = function me(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(meRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const hasOrganisationRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'HasOrganisation');
}
hasOrganisationRef.operationName = 'HasOrganisation';
exports.hasOrganisationRef = hasOrganisationRef;

exports.hasOrganisation = function hasOrganisation(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(hasOrganisationRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const myOrganisationRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyOrganisation');
}
myOrganisationRef.operationName = 'MyOrganisation';
exports.myOrganisationRef = myOrganisationRef;

exports.myOrganisation = function myOrganisation(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(myOrganisationRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const listTendersRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListTenders');
}
listTendersRef.operationName = 'ListTenders';
exports.listTendersRef = listTendersRef;

exports.listTenders = function listTenders(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(listTendersRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const getTenderRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetTender', inputVars);
}
getTenderRef.operationName = 'GetTender';
exports.getTenderRef = getTenderRef;

exports.getTender = function getTender(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getTenderRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const publicIssuedTendersRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'PublicIssuedTenders');
}
publicIssuedTendersRef.operationName = 'PublicIssuedTenders';
exports.publicIssuedTendersRef = publicIssuedTendersRef;

exports.publicIssuedTenders = function publicIssuedTenders(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(publicIssuedTendersRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;
