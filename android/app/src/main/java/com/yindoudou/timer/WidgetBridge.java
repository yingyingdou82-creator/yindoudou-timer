package com.yindoudou.timer;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 网页界面 → 安卓桌面小部件的"数据桥"：
 * 界面把勾选了"显示在桌面小组件"的事件（精简 JSON）传过来，
 * 存进安卓的 SharedPreferences，然后立即刷新桌面小部件。
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    @PluginMethod
    public void sync(PluginCall call) {
        String data = call.getString("data", "[]");
        try {
            Context ctx = getContext();
            ctx.getSharedPreferences("ydd_widget", Context.MODE_PRIVATE)
                .edit()
                .putString("data", data)
                .apply();
            YddWidgetProvider.pushUpdate(ctx);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("小组件数据同步失败: " + e.getMessage());
        }
    }
}
