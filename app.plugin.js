const {
  AndroidConfig,
  withInfoPlist,
  withEntitlementsPlist,
  withAndroidManifest,
} = require('@expo/config-plugins');

const NFC_READER = 'Interact with nearby NFC devices';

function withIosPermission(c, props = {}) {
  const {nfcPermission} = props;
  return withInfoPlist(c, (config) => {
    // https://developer.apple.com/documentation/bundleresources/information_property_list/nfcreaderusagedescription?language=objc
    config.modResults.NFCReaderUsageDescription =
      nfcPermission ||
      config.modResults.NFCReaderUsageDescription ||
      NFC_READER;
    return config;
  });
}

function addValuesToArray(obj, key, values) {
  if (!Array.isArray(values) || !values.length) {
    return obj;
  }
  if (!Array.isArray(obj[key])) {
    obj[key] = [];
  }
  // Add the required values
  obj[key].push(...values);

  // Remove duplicates
  obj[key] = [...new Set(obj[key])];

  // Prevent adding empty arrays to Info.plist or *.entitlements
  if (!obj[key].length) {
    delete obj[key];
  }

  return obj;
}

function withIosNfcEntitlement(c, {includeNdefEntitlement}) {
  return withEntitlementsPlist(c, (config) => {
    // Add the required formats
    let entitlements = ['NDEF', 'TAG'];
    if (includeNdefEntitlement === false) {
      entitlements = ['TAG'];
    }
    config.modResults = addValuesToArray(
      config.modResults,
      'com.apple.developer.nfc.readersession.formats',
      entitlements,
    );

    return config;
  });
}

function withIosNfcSelectIdentifiers(c, {selectIdentifiers}) {
  return withInfoPlist(c, (config) => {
    // Add the user defined identifiers
    config.modResults = addValuesToArray(
      config.modResults,
      // https://developer.apple.com/documentation/bundleresources/information_property_list/select-identifiers
      'com.apple.developer.nfc.readersession.iso7816.select-identifiers',
      selectIdentifiers || [],
    );

    return config;
  });
}

function withIosNfcSystemCodes(c, {systemCodes}) {
  return withInfoPlist(c, (config) => {
    // Add the user defined identifiers
    config.modResults = addValuesToArray(
      config.modResults,
      // https://developer.apple.com/documentation/bundleresources/information_property_list/systemcodes
      'com.apple.developer.nfc.readersession.felica.systemcodes',
      systemCodes || [],
    );

    return config;
  });
}

const GENERATED_TAG = 'data-generated';

function renderIntentFilterData(data) {
  return (Array.isArray(data) ? data : [data]).filter(Boolean).map((datum) => ({
    $: Object.entries(datum ?? {}).reduce(
      (prev, [key, value]) => ({...prev, [`android:${key}`]: value}),
      {},
    ),
  }));
}

function renderIntentFilterCategory(category) {
  return (Array.isArray(category) ? category : [category])
    .filter(Boolean)
    .map((cat) => ({
      $: {
        'android:name': `android.intent.category.${cat}`,
      },
    }));
}

function renderNfcIntentFilters(intentFilters) {
  return intentFilters.map((intentFilter) => {
    // <intent-filter>
    return {
      $: {
        'android:autoVerify': intentFilter.autoVerify ? 'true' : undefined,
        // Add a custom "generated" tag that we can query later to remove.
        [GENERATED_TAG]: 'true',
      },
      action: [
        // <action android:name="android.intent.action.VIEW"/>
        {
          $: {
            'android:name': `android.nfc.action.${intentFilter.action}`,
          },
        },
      ],
      data: renderIntentFilterData(intentFilter.data),
      category: renderIntentFilterCategory(intentFilter.category),
    };
  });
}

function addNfcIntentFilters(c, androidManifest, nfcIntentFilters) {
  const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
    androidManifest,
  );

  // Remove all generated tags from previous runs...
  if (mainActivity['intent-filter']?.length) {
    mainActivity['intent-filter'] = mainActivity['intent-filter'].filter(
      (value) => value.$?.[GENERATED_TAG] !== 'true',
    );
  }

  // this needs to be modified such that it picks up the extra intent filters from the config
  const intentFilters = AndroidConfig.IntentFilters.getIntentFilters(c);
  if (intentFilters.length + nfcIntentFilters.length === 0) {
    return androidManifest;
  }

  // adds them to the manifest
  mainActivity['intent-filter'] = mainActivity['intent-filter']?.concat(
    AndroidConfig.IntentFilters.default(intentFilters),
    renderNfcIntentFilters(nfcIntentFilters),
  );

  return androidManifest;
}

const withNfcIntentFilters = (c, {intentFilters}) => {
  /**
   * Modify the AndroidManifest.xml to add the NFC intent filters.
   */
  return withAndroidManifest(c, (config) => {
    config.modResults = addNfcIntentFilters(
      config,
      config.modResults,
      intentFilters,
    );

    return config;
  });
};

function withNfc(config, props = {}) {
  const {
    nfcPermission,
    selectIdentifiers,
    systemCodes,
    includeNdefEntitlement,
    intentFilters,
  } = props;
  config = withIosNfcEntitlement(config, {includeNdefEntitlement});
  config = withIosNfcSelectIdentifiers(config, {selectIdentifiers});
  config = withIosNfcSystemCodes(config, {systemCodes});
  config = withNfcIntentFilters(config, {intentFilters});

  // We start to support Android 12 from v3.11.1, and you will need to update compileSdkVersion to 31,
  // otherwise the build will fail:
  config = AndroidConfig.Version.withBuildScriptExtMinimumVersion(config, {
    name: 'compileSdkVersion',
    minVersion: 31,
  });

  if (nfcPermission !== false) {
    config = withIosPermission(config, props);
    config = AndroidConfig.Permissions.withPermissions(config, [
      'android.permission.NFC',
    ]);
  }
  return config;
}

module.exports = withNfc;
