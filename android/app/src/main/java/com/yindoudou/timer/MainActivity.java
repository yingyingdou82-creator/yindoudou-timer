package com.yindoudou.timer;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** 点桌面小组件启动 App 时置为 true（界面读取一次后清掉） */
    public static volatile boolean launchedFromWidget = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 注册"界面 → 桌面小组件"的数据桥
        registerPlugin(WidgetBridge.class);
        checkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        checkIntent(intent);
    }

    private void checkIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("from_widget", false)) {
            launchedFromWidget = true;
        }
    }
}
