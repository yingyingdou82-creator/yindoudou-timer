package com.yindoudou.timer;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
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

    /** 界面启动时问一次"是不是点桌面小组件进来的"，读完即清（只生效一次） */
    @PluginMethod
    public void getLaunchReason(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("reason", MainActivity.launchedFromWidget ? "widget" : "normal");
        MainActivity.launchedFromWidget = false;
        call.resolve(ret);
    }

    /**
     * 请求把小组件"钉"到桌面：系统会弹一个"添加到主屏幕"确认框，
     * 用户点确定后小组件直接出现在桌面（不用手动去小组件列表里找）。
     */
    @PluginMethod
    public void requestPin(PluginCall call) {
        Activity act = getActivity();
        if (act == null) {
            call.reject("界面还没准备好，稍后再试");
            return;
        }
        AppWidgetManager mgr = AppWidgetManager.getInstance(act);
        ComponentName provider = new ComponentName(act, YddWidgetProvider.class);
        if (mgr.isRequestPinAppWidgetSupported()) {
            mgr.requestPinAppWidget(provider, null, null);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } else {
            call.reject("这款桌面不支持一键添加，请长按桌面空白处手动添加小组件");
        }
    }
}
