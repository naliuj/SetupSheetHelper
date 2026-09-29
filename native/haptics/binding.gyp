{
  "targets": [
    {
      "target_name": "haptics",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["haptics.mm"],
          "link_settings": { "libraries": ["$(SDKROOT)/System/Library/Frameworks/AppKit.framework"] },
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "OTHER_CFLAGS": ["-fobjc-arc"]
          }
        }, {
          "type": "none"
        }]
      ]
    }
  ]
}
