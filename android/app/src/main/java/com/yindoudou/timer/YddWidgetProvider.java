package com.yindoudou.timer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 安卓桌面小部件（长按桌面 → 小组件 → 银豆豆计时）：
 * 显示勾选了"显示在桌面小组件"的事件和倒计时天数。
 * 数据来源：App 打开时由界面通过 WidgetBridge 同步到 SharedPreferences；
 * 系统每 30 分钟也会自动刷新一次（天数跨天自动更新）。
 */
public class YddWidgetProvider extends AppWidgetProvider {

    private static final int MAX_ROWS = 5;

    static void pushUpdate(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, YddWidgetProvider.class));
        if (ids.length > 0) {
            new YddWidgetProvider().onUpdate(ctx, mgr, ids);
        }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences prefs = ctx.getSharedPreferences("ydd_widget", Context.MODE_PRIVATE);
        JSONArray rows = parse(prefs.getString("data", "[]"));

        for (int id : ids) {
            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.ydd_widget);

            int shown = Math.min(rows.length(), MAX_ROWS);
            if (shown == 0) {
                views.setTextViewText(R.id.row0_name, "打开 App，勾选「显示在桌面小组件」");
                views.setTextViewText(R.id.row0_count, "");
                for (int i = 1; i < MAX_ROWS; i++) {
                    views.setViewVisibility(rowId(i), android.view.View.GONE);
                }
            } else {
                for (int i = 0; i < MAX_ROWS; i++) {
                    if (i < shown) {
                        JSONObject ev = rows.optJSONObject(i);
                        String name = ev != null ? ev.optString("n", "") : "";
                        String date = ev != null ? ev.optString("d", "") : "";
                        String endDate = ev != null ? ev.optString("e", "") : "";
                        views.setTextViewText(rowNameId(i), name);
                        views.setTextViewText(rowCountId(i), countText(date, endDate));
                        views.setViewVisibility(rowId(i), android.view.View.VISIBLE);
                    } else {
                        views.setViewVisibility(rowId(i), android.view.View.GONE);
                    }
                }
            }

            // 点小部件任意位置 = 打开 App，并带上"来自小组件"标记
            // （界面收到标记后自动弹出"勾选桌面事件"面板）
            Intent open = new Intent(ctx, MainActivity.class)
                .putExtra("from_widget", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            views.setOnClickPendingIntent(R.id.widget_root, pi);

            mgr.updateAppWidget(id, views);
        }
    }

    private static JSONArray parse(String raw) {
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static int rowId(int i) {
        switch (i) {
            case 0: return R.id.row0;
            case 1: return R.id.row1;
            case 2: return R.id.row2;
            case 3: return R.id.row3;
            default: return R.id.row4;
        }
    }

    private static int rowNameId(int i) {
        switch (i) {
            case 0: return R.id.row0_name;
            case 1: return R.id.row1_name;
            case 2: return R.id.row2_name;
            case 3: return R.id.row3_name;
            default: return R.id.row4_name;
        }
    }

    private static int rowCountId(int i) {
        switch (i) {
            case 0: return R.id.row0_count;
            case 1: return R.id.row1_count;
            case 2: return R.id.row2_count;
            case 3: return R.id.row3_count;
            default: return R.id.row4_count;
        }
    }

    /** 自然日倒计时文案（和小程序端同一套规则） */
    private static String countText(String date, String endDate) {
        long today = todayEpochDay();
        long start = epochDayOf(date);
        if (start == Long.MIN_VALUE) return "";

        if (!endDate.isEmpty()) {
            long end = epochDayOf(endDate);
            if (end != Long.MIN_VALUE) {
                if (today < start) return "距开始 " + (start - today) + " 天";
                if (today < end) return "截止还有 " + (end - today) + " 天";
                if (today == end) return "今天截止！";
                return "已结束 " + (today - end) + " 天";
            }
        }

        long diff = start - today;
        if (diff > 0) return "还有 " + diff + " 天";
        if (diff == 0) return "就是今天！";
        return "已经 " + (-diff) + " 天";
    }

    /** YYYY-MM-DD → 天序号（儒略日算法，无时区问题） */
    private static long epochDayOf(String s) {
        if (s == null || s.length() != 10) return Long.MIN_VALUE;
        try {
            int y = Integer.parseInt(s.substring(0, 4));
            int m = Integer.parseInt(s.substring(5, 7));
            int d = Integer.parseInt(s.substring(8, 10));
            long a = (14 - m) / 12;
            long y2 = y + 4800 - a;
            long m2 = m + 12 * a - 3;
            return d + (153 * m2 + 2) / 5 + 365 * y2 + y2 / 4 - y2 / 100 + y2 / 400 - 32045;
        } catch (Exception e) {
            return Long.MIN_VALUE;
        }
    }

    private static long todayEpochDay() {
        java.util.Calendar c = java.util.Calendar.getInstance();
        return epochDayOf(String.format(
            java.util.Locale.US, "%04d-%02d-%02d",
            c.get(java.util.Calendar.YEAR),
            c.get(java.util.Calendar.MONTH) + 1,
            c.get(java.util.Calendar.DAY_OF_MONTH)));
    }
}
