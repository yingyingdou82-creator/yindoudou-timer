package com.yindoudou.timer;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** 点桌面小组件启动 App 时置为 true（界面读取一次后清掉） */
    public static volatile boolean launchedFromWidget = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 BridgeActivity 初始化前注册，否则 WebView 侧拿不到自定义插件。
        registerPlugin(WidgetBridge.class);
        super.onCreate(savedInstanceState);
        checkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        checkIntent(intent);
    }

    private void checkIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("from_widget", false)) {
            launchedFromWidget = true;
        }
    }
}
