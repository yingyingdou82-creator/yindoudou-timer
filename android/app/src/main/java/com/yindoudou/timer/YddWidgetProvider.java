package com.yindoudou.timer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
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
    private static final int TOTAL_ROWS = 9;

    /** 这个尺寸最多显示几条事件（子类按尺寸覆写） */
    protected int maxRows() {
        return 5; // 中号（默认）
    }

    static void pushUpdate(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        // 三种尺寸各是独立的小组件，都要刷新
        updateOne(ctx, mgr, YddWidgetProviderSmall.class, new YddWidgetProviderSmall());
        updateOne(ctx, mgr, YddWidgetProviderMedium.class, new YddWidgetProviderMedium());
        updateOne(ctx, mgr, YddWidgetProviderLarge.class, new YddWidgetProviderLarge());
    }

    private static void updateOne(Context ctx, AppWidgetManager mgr, Class<?> cls, YddWidgetProvider p) {
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, cls));
        if (ids.length > 0) {
            p.onUpdate(ctx, mgr, ids);
        }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences prefs = ctx.getSharedPreferences("ydd_widget", Context.MODE_PRIVATE);
        JSONArray rows = parse(prefs.getString("data", "[]"));
        JSONArray attendance = parse(prefs.getString("attendance", "[]"));
        final int max = maxRows();

        for (int id : ids) {
            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.ydd_widget);

            int shown = Math.min(rows.length(), max);
            if (shown == 0) {
                views.setTextViewText(R.id.row0_icon, "🫘");
                views.setTextViewText(R.id.row0_name, "打开 App，勾选「显示在桌面小组件」");
                views.setTextViewText(R.id.row0_count, "");
                views.setViewVisibility(R.id.row0, android.view.View.VISIBLE);
                for (int i = 1; i < TOTAL_ROWS; i++) {
                    views.setViewVisibility(rowId(i), android.view.View.GONE);
                }
            } else {
                for (int i = 0; i < TOTAL_ROWS; i++) {
                    if (i < shown) {
                        JSONObject ev = rows.optJSONObject(i);
                        String name = ev != null ? ev.optString("n", "") : "";
                        String icon = ev != null ? ev.optString("i", "🎯") : "🎯";
                        views.setTextViewText(rowIconId(i), icon.isEmpty() ? "🎯" : icon);
                        views.setTextViewText(rowNameId(i), name);
                        views.setTextViewText(rowCountId(i), countText(ev, attendance));
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
            case 4: return R.id.row4;
            case 5: return R.id.row5;
            case 6: return R.id.row6;
            case 7: return R.id.row7;
            default: return R.id.row8;
        }
    }

    private static int rowNameId(int i) {
        switch (i) {
            case 0: return R.id.row0_name;
            case 1: return R.id.row1_name;
            case 2: return R.id.row2_name;
            case 3: return R.id.row3_name;
            case 4: return R.id.row4_name;
            case 5: return R.id.row5_name;
            case 6: return R.id.row6_name;
            case 7: return R.id.row7_name;
            default: return R.id.row8_name;
        }
    }

    private static int rowIconId(int i) {
        switch (i) {
            case 0: return R.id.row0_icon;
            case 1: return R.id.row1_icon;
            case 2: return R.id.row2_icon;
            case 3: return R.id.row3_icon;
            case 4: return R.id.row4_icon;
            case 5: return R.id.row5_icon;
            case 6: return R.id.row6_icon;
            case 7: return R.id.row7_icon;
            default: return R.id.row8_icon;
        }
    }

    private static int rowCountId(int i) {
        switch (i) {
            case 0: return R.id.row0_count;
            case 1: return R.id.row1_count;
            case 2: return R.id.row2_count;
            case 3: return R.id.row3_count;
            case 4: return R.id.row4_count;
            case 5: return R.id.row5_count;
            case 6: return R.id.row6_count;
            case 7: return R.id.row7_count;
            default: return R.id.row8_count;
        }
    }

    /** 倒计时文案：和 App 主界面尽量保持同一套口径 */
    private static String countText(JSONObject ev, JSONArray attendance) {
        if (ev == null) return "";
        String date = ev.optString("d", "");
        String endDate = ev.optString("e", "");
        String time = ev.optString("t", "");
        String countType = ev.optString("ct", "natural");
        boolean workdayHoliday = ev.optBoolean("wh", false);
        boolean includeStartDay = ev.optBoolean("inc", false);

        long today = todayEpochDay();
        long start = epochDayOf(date);
        if (start == Long.MIN_VALUE) return "";
        long rawDays = start - today;

        if (!endDate.isEmpty()) {
            long end = epochDayOf(endDate);
            if (end != Long.MIN_VALUE) {
                if (today < start) return "距开始 " + buildParts(ev, countType, workdayHoliday, today, start, attendance);
                if (today == start && isTime(time)) {
                    int diff = parseHm(time) - nowMinutes();
                    if (diff > 0) return "距开始 " + fmtMinutes(diff);
                }
                if (today < end) return "截止还有 " + buildParts(ev, countType, workdayHoliday, today, end, attendance);
                if (today == end) return "今天截止！";
                return "已结束 " + buildParts(ev, countType, workdayHoliday, end, today, attendance);
            }
        }

        if (rawDays == 0) {
            if (isTime(time)) {
                int diff = parseHm(time) - nowMinutes();
                if (diff == 0) return "就是现在！";
                if (diff > 0) return "还有 " + fmtMinutes(diff);
                return "已经 " + fmtMinutes(-diff);
            }
            return "就是今天！";
        }
        long offset = includeStartDay ? -1 : 0;
        if (rawDays > 0) return "还有 " + buildParts(ev, countType, workdayHoliday, today + offset, start, attendance);
        return "已经 " + buildParts(ev, countType, workdayHoliday, start + offset, today, attendance);
    }

    private static String buildParts(
        JSONObject ev,
        String countType,
        boolean workdayHoliday,
        long from,
        long to,
        JSONArray attendance
    ) {
        long total = Math.max(0, to - from);
        if ("week".equals(countType)) {
            return joinParts(total / 7, "周", total % 7, "天");
        }
        if ("year".equals(countType)) {
            return decompose(from, to);
        }
        if ("workday".equals(countType)) {
            if ("attendance".equals(ev.optString("wm", "calendar"))) {
                return actualWorkedDays(attendance, from, to) + " 个实际出勤日";
            }
            int n = 0;
            for (long d = from + 1; d <= to; d++) {
                if (workdayHoliday ? isWorkdayDate(dayString(d)) : isWeekday(d)) n++;
            }
            return n + " 个工作日";
        }
        return total + " 天";
    }

    /** 只计算用户在 App 中明确标记为“上班”的日期，支持周末加班。 */
    private static int actualWorkedDays(JSONArray attendance, long from, long to) {
        String fromDate = dayString(from);
        String toDate = dayString(to);
        Set<String> dates = new HashSet<>();
        for (int i = 0; i < attendance.length(); i++) {
            JSONObject record = attendance.optJSONObject(i);
            if (record == null || !"worked".equals(record.optString("s", ""))) continue;
            String date = record.optString("d", "");
            if (date.compareTo(fromDate) > 0 && date.compareTo(toDate) <= 0) {
                dates.add(date);
            }
        }
        return dates.size();
    }

    private static String joinParts(long a, String au, long b, String bu) {
        if (a > 0 && b > 0) return a + " " + au + " " + b + " " + bu;
        if (a > 0) return a + " " + au;
        return b + " " + bu;
    }

    private static String decompose(long from, long to) {
        int years = 0;
        while (addMonths(from, (years + 1) * 12) <= to) years++;
        long afterYears = addMonths(from, years * 12);

        int months = 0;
        while (addMonths(afterYears, months + 1) <= to) months++;
        long afterMonths = addMonths(afterYears, months);

        long restDays = Math.max(0, to - afterMonths);
        long weeks = restDays / 7;
        long days = restDays % 7;

        StringBuilder sb = new StringBuilder();
        appendPart(sb, years, "年");
        appendPart(sb, months, "个月");
        appendPart(sb, weeks, "周");
        appendPart(sb, days, "天");
        return sb.length() == 0 ? "0 天" : sb.toString();
    }

    private static void appendPart(StringBuilder sb, long n, String unit) {
        if (n <= 0) return;
        if (sb.length() > 0) sb.append(" ");
        sb.append(n).append(" ").append(unit);
    }

    private static long addMonths(long base, int months) {
        int[] ymd = ymdOf(base);
        int y = ymd[0];
        int m = ymd[1] + months;
        int d = ymd[2];
        y += Math.floorDiv(m - 1, 12);
        m = Math.floorMod(m - 1, 12) + 1;
        d = Math.min(d, daysInMonth(y, m));
        return epochDayOf(String.format(Locale.US, "%04d-%02d-%02d", y, m, d));
    }

    private static int daysInMonth(int y, int m) {
        switch (m) {
            case 1: case 3: case 5: case 7: case 8: case 10: case 12: return 31;
            case 4: case 6: case 9: case 11: return 30;
            default: return isLeap(y) ? 29 : 28;
        }
    }

    private static boolean isLeap(int y) {
        return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    }

    private static boolean isTime(String time) {
        return time != null && time.matches("([01]\\d|2[0-3]):[0-5]\\d");
    }

    private static int parseHm(String time) {
        return Integer.parseInt(time.substring(0, 2)) * 60 + Integer.parseInt(time.substring(3, 5));
    }

    private static int nowMinutes() {
        Calendar c = Calendar.getInstance();
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    private static String fmtMinutes(int total) {
        int h = total / 60;
        int m = total % 60;
        return joinParts(h, "小时", m, "分钟");
    }

    private static boolean isWeekday(long day) {
        int w = calendarFor(day).get(Calendar.DAY_OF_WEEK);
        return w >= Calendar.MONDAY && w <= Calendar.FRIDAY;
    }

    private static boolean isWorkdayDate(String date) {
        if (inRanges(date, OFF_2025) || inRanges(date, OFF_2026)) return false;
        if (inRanges(date, WORK_2025) || inRanges(date, WORK_2026)) return true;
        long day = epochDayOf(date);
        return day != Long.MIN_VALUE && isWeekday(day);
    }

    private static boolean inRanges(String date, String[][] ranges) {
        for (String[] r : ranges) {
            if (date.compareTo(r[0]) >= 0 && date.compareTo(r[1]) <= 0) return true;
        }
        return false;
    }

    private static final String[][] OFF_2025 = {
        {"2025-01-01", "2025-01-01"},
        {"2025-01-28", "2025-02-04"},
        {"2025-04-04", "2025-04-06"},
        {"2025-05-01", "2025-05-05"},
        {"2025-05-31", "2025-06-02"},
        {"2025-10-01", "2025-10-08"}
    };
    private static final String[][] WORK_2025 = {
        {"2025-01-26", "2025-01-26"},
        {"2025-02-08", "2025-02-08"},
        {"2025-04-27", "2025-04-27"},
        {"2025-09-28", "2025-09-28"},
        {"2025-10-11", "2025-10-11"}
    };
    private static final String[][] OFF_2026 = {
        {"2026-01-01", "2026-01-03"},
        {"2026-02-15", "2026-02-23"},
        {"2026-04-04", "2026-04-06"},
        {"2026-05-01", "2026-05-05"},
        {"2026-06-19", "2026-06-21"},
        {"2026-09-25", "2026-09-27"},
        {"2026-10-01", "2026-10-07"}
    };
    private static final String[][] WORK_2026 = {
        {"2026-01-04", "2026-01-04"},
        {"2026-02-14", "2026-02-14"},
        {"2026-02-28", "2026-02-28"},
        {"2026-05-09", "2026-05-09"},
        {"2026-09-20", "2026-09-20"},
        {"2026-10-10", "2026-10-10"}
    };

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
        Calendar c = Calendar.getInstance();
        return epochDayOf(String.format(
            Locale.US, "%04d-%02d-%02d",
            c.get(Calendar.YEAR),
            c.get(Calendar.MONTH) + 1,
            c.get(Calendar.DAY_OF_MONTH)));
    }

    private static String dayString(long day) {
        int[] ymd = ymdOf(day);
        return String.format(Locale.US, "%04d-%02d-%02d", ymd[0], ymd[1], ymd[2]);
    }

    private static Calendar calendarFor(long day) {
        int[] ymd = ymdOf(day);
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        c.clear();
        c.set(ymd[0], ymd[1] - 1, ymd[2]);
        return c;
    }

    /** 儒略日序号 → 年月日 */
    private static int[] ymdOf(long jd) {
        long l = jd + 68569;
        long n = 4 * l / 146097;
        l = l - (146097 * n + 3) / 4;
        long i = 4000 * (l + 1) / 1461001;
        l = l - 1461 * i / 4 + 31;
        long j = 80 * l / 2447;
        int d = (int) (l - 2447 * j / 80);
        l = j / 11;
        int m = (int) (j + 2 - 12 * l);
        int y = (int) (100 * (n - 49) + i + l);
        return new int[] { y, m, d };
    }
}
