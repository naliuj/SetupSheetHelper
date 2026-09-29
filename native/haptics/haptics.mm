// Trackpad haptic feedback for Setup Sheet Helper — the one thing Electron has no API for.
//
// Plain N-API rather than node-addon-api or NAN: N-API is ABI-stable, so one build of this file
// loads in Node and in every Electron version alike, and never needs the per-runtime rebuild
// better-sqlite3 does. Only the CPU architecture matters.
//
// Electron's main process runs JavaScript on the AppKit main thread, so NSHapticFeedbackManager can
// be called directly. The feedback is only felt while a finger is on a Force Touch trackpad, and
// macOS drops it silently when the user has turned haptics off — neither is an error here.
#import <AppKit/AppKit.h>
#include <node_api.h>

static napi_value Perform(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 1) return nullptr;

  int32_t pattern = 0;
  if (napi_get_value_int32(env, argv[0], &pattern) != napi_ok) return nullptr;

  // 0 generic, 1 alignment, 2 level change — the order of NSHapticFeedbackPattern itself.
  NSHapticFeedbackPattern feedback = NSHapticFeedbackPatternGeneric;
  if (pattern == 1) feedback = NSHapticFeedbackPatternAlignment;
  else if (pattern == 2) feedback = NSHapticFeedbackPatternLevelChange;

  [[NSHapticFeedbackManager defaultPerformer] performFeedbackPattern:feedback
                                                     performanceTime:NSHapticFeedbackPerformanceTimeNow];
  return nullptr;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  if (napi_create_function(env, "perform", NAPI_AUTO_LENGTH, Perform, nullptr, &fn) == napi_ok) {
    napi_set_named_property(env, exports, "perform", fn);
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
