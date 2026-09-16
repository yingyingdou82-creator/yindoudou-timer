package com.yindoudou.timer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 注册"界面 → 桌面小组件"的数据桥
        registerPlugin(WidgetBridge.class);
    }
}
