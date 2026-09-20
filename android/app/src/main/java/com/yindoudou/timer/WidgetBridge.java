package com.yindoudou.timer;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
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
        String attendance = call.getString("attendance", "[]");
        try {
            Context ctx = getContext();
            ctx.getSharedPreferences("ydd_widget", Context.MODE_PRIVATE)
                .edit()
                .putString("data", data)
                .putString("attendance", attendance)
                // 小组件紧接着就会刷新，用 commit 保证刷新时能读到最新事件。
                .commit();
            YddWidgetProvider.pushUpdate(ctx);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("小组件数据同步失败: " + e.getMessage());
        }
    }

    /** 返回桌面上已有的小组件数量，用来决定是否提示用户添加。 */
    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int count =
            mgr.getAppWidgetIds(new ComponentName(ctx, YddWidgetProviderSmall.class)).length +
            mgr.getAppWidgetIds(new ComponentName(ctx, YddWidgetProviderMedium.class)).length +
            mgr.getAppWidgetIds(new ComponentName(ctx, YddWidgetProviderLarge.class)).length;
        JSObject ret = new JSObject();
        ret.put("count", count);
        ret.put(
            "canPin",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && mgr.isRequestPinAppWidgetSupported()
        );
        call.resolve(ret);
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
        // 一键添加默认放"中号"；小号/大号在桌面长按 → 小组件里选
        ComponentName provider = new ComponentName(act, YddWidgetProviderMedium.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && mgr.isRequestPinAppWidgetSupported()) {
            boolean requested = mgr.requestPinAppWidget(provider, null, null);
            if (!requested) {
                call.reject("桌面暂时无法添加小组件，请长按桌面空白处后在小组件列表中添加");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } else {
            call.reject("这款桌面不支持一键添加，请长按桌面空白处手动添加小组件");
        }
    }
}
