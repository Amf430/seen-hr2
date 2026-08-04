#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════════════
 جسر ZKTeco → Firebase   |   سين العقارية - إدارة الموارد البشرية
════════════════════════════════════════════════════════════════════════
 يقرأ البصمات من جهاز ZKTeco على الشبكة المحلية ويرفعها إلى Firestore
 في مجموعة منفصلة تماماً:  zkAttendance   (سجل الجهاز)
 بينما تسجيل الحضور من الموقع يبقى في:    attendance     (سجل الموقع)
 → لا يتعارضان أبداً، ولا يقفل أحدهما جلسة الآخر.

 طريقة التشغيل:
   python zk_bridge.py            التشغيل العادي (حلقة مستمرة)
   python zk_bridge.py --debug    اختبار: يطبع البصمات الخام بلا رفع  ← ابدأ بهذا
   python zk_bridge.py --once     دورة واحدة فقط ثم يخرج
   python zk_bridge.py --reset    يصفّر ملف الحالة (يعيد قراءة كل السجل)
   python zk_bridge.py --days 7   يرفع بصمات آخر 7 أيام فقط (مع --reset)
════════════════════════════════════════════════════════════════════════
"""

import argparse
import ctypes
import datetime
import json
import os
import sys
import time
import traceback


# ════════════════════════════════════════════════════════════════════
#  منع نوم ويندوز
# ════════════════════════════════════════════════════════════════════
#  ⚠️ هذا أهم إصلاح لمشكلة «كل ما نام الجهاز توقف الجسر».
#
#  تشغيل الجسر كخدمة ويندوز يجعله يبدأ مع الإقلاع ويعيد تشغيل نفسه عند
#  التعطّل — لكنه لا يمنع النوم إطلاقاً. الجهاز ينام، فتُعلَّق العملية،
#  ويُطفأ كرت الشبكة، ويتوقّف الرفع حتى يوقظه أحد.
#
#  SetThreadExecutionState تخبر ويندوز: «هذه العملية تحتاج النظام مستيقظاً».
#  ES_SYSTEM_REQUIRED يمنع نوم النظام، و ES_CONTINUOUS يجعل الطلب دائماً لا
#  لمرة واحدة. الشاشة تُترك تنام (ES_DISPLAY_REQUIRED غير مستعمل عمداً) —
#  إطفاء الشاشة لا يوقف الجسر، ولا داعي لإبقائها مضاءة طوال الليل.
#
#  ملاحظة: يبقى ضبط powercfg مطلوباً كطبقة ثانية — انظر setup-power.bat.
#  الاثنان معاً لأن سياسة المجموعة قد تتجاوز أحدهما.
ES_CONTINUOUS      = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


def prevent_sleep():
    """يمنع نوم النظام ما دام الجسر يعمل. يُرجع True إن نجح."""
    if os.name != "nt":
        return False          # ليس ويندوز — لا شيء نفعله
    try:
        ok = ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
        return bool(ok)
    except Exception:
        return False


def allow_sleep():
    """يرفع المنع عند الخروج — حتى لا يبقى الجهاز مستيقظاً بلا سبب."""
    if os.name != "nt":
        return
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
    except Exception:
        pass

# ── مكتبات خارجية ───────────────────────────────────────────────────
try:
    from zk import ZK
except ImportError:
    print("❌ مكتبة pyzk غير مثبتة. نفّذ:  pip install pyzk")
    sys.exit(1)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("❌ مكتبة firebase-admin غير مثبتة. نفّذ:  pip install firebase-admin")
    sys.exit(1)


# ════════════════════════════════════════════════════════════════════
#  الإعدادات — عدّلها حسب جهازك
# ════════════════════════════════════════════════════════════════════
ZK_IP        = "192.168.1.201"   # IP جهاز البصمة
ZK_PORT      = 4370              # البورت (افتراضي 4370)
ZK_PASSWORD  = 0                 # كلمة مرور اتصال الجهاز (0 إن لا يوجد)
ZK_FORCE_UDP = False             # جرّب True لو تعذّر الاتصال

POLL_SECONDS  = 60               # كل كم ثانية يقرأ الجهاز
CACHE_SECONDS = 900              # كل كم ثانية يُحدّث الموظفين/الإعدادات (15 دقيقة)
                                 # ⚠️ لا تُنزّلها — كانت السبب في استهلاك الحصة المجانية

# أقل فاصل زمني بين بصمتين لنفس الموظف حتى تُحسب بصمة جديدة (ثانية).
# البصمات المتكررة داخل هذه الفترة تُعتبر تكراراً وتُتجاهل.
MIN_GAP_SECONDS = 120

SERVICE_ACCOUNT_FILE = "serviceAccountKey.json"
STATE_FILE           = "zk_state.json"

# توقيت السعودية = UTC+3 ثابت (لا توقيت صيفي) — بلا أي مكتبة خارجية
TZ = datetime.timezone(datetime.timedelta(hours=3))

COLL_DEVICE = "zkAttendance"     # مجموعة سجل الجهاز (منفصلة عن سجل الموقع)
BRIDGE_DOC  = ("bridge", "status")


# ════════════════════════════════════════════════════════════════════
#  أدوات
# ════════════════════════════════════════════════════════════════════
def log(msg):
    ts = datetime.datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def aware(dt):
    """يضيف المنطقة الزمنية للأوقات القادمة من الجهاز (naive = توقيت محلي).

    هذا أهم إصلاح في الملف: بدونه يخزّن Firestore الوقت كأنه UTC،
    فتظهر بصمة الساعة 08:00 في النظام الساعة 11:00 صباحاً.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            log("⚠️ ملف الحالة تالف — سيُعاد إنشاؤه.")
    return {"last_ts": None}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, STATE_FILE)          # كتابة ذرّية — لا يتلف الملف لو توقّف البرنامج


def init_firebase():
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        log(f"❌ ملف المفتاح {SERVICE_ACCOUNT_FILE} غير موجود في نفس مجلد السكربت.")
        sys.exit(1)
    cred = credentials.Certificate(SERVICE_ACCOUNT_FILE)
    firebase_admin.initialize_app(cred)
    return firestore.client()


# ════════════════════════════════════════════════════════════════════
#  الاتصال بالجهاز
# ════════════════════════════════════════════════════════════════════
def _read_once():
    """محاولة قراءة واحدة. يرجع (قائمة البصمات, رسالة الخطأ)."""
    # ⚠️ ommit_ping=True مقصود ويصلح أكثر أعطال هذا الجسر شيوعاً.
    #
    #   pyzk يرسل ping (ICMP) قبل كل اتصال، ويرفض المحاولة إن لم يردّ.
    #   لكن كثيراً من أجهزة ZKTeco لا تردّ على ICMP أصلاً، وجدار حماية
    #   ويندوز يحجبه افتراضياً. النتيجة:
    #       ZKNetworkError: can't reach device (ping 192.168.1.201)
    #   بينما الجهاز يعمل ومنفذ 4370 مفتوح ومستجيب تماماً.
    #
    #   بتخطّي الـping نجرّب الاتصال الحقيقي مباشرةً — وهو الفحص الوحيد
    #   الذي يعني شيئاً. فشلُه خطأ حقيقي، لا خطأ ICMP.
    zk = ZK(ZK_IP, port=ZK_PORT, password=ZK_PASSWORD,
            timeout=20, force_udp=ZK_FORCE_UDP, ommit_ping=True)
    conn = None
    try:
        conn = zk.connect()
        # ملاحظة: لا نستخدم disable_device() — كان يمنع الموظفين من البصم
        # أثناء كل دورة قراءة (حتى 16% من وقت الدوام).
        logs = conn.get_attendance() or []
        return logs, None
    except Exception as e:
        return [], f"{type(e).__name__}: {e}"
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


# كم محاولة داخل الدورة الواحدة قبل اعتبارها فشلاً، وكم ثانية بينها.
READ_ATTEMPTS = 3
READ_BACKOFF  = 5


def read_device():
    """يرجع (قائمة البصمات, رسالة الخطأ) بعد عدة محاولات.

    ⚠️ المحاولة الواحدة كانت تعني أن أي تعثّر لحظي (الجهاز مشغول ببصمة
    موظف، أو الشبكة تعيد التفاوض) يُسقط الدورة كاملةً ويُظهر الجسر
    «منقطعاً» في اللوحة — ثم ينجح تلقائياً بعد دقيقة. ثلاث محاولات
    متباعدة تبتلع هذا كله بلا أن يراه أحد.
    """
    last_err = None
    for attempt in range(1, READ_ATTEMPTS + 1):
        logs, err = _read_once()
        if not err:
            if attempt > 1:
                log(f"↻ نجح الاتصال بالجهاز في المحاولة {attempt}.")
            return logs, None
        last_err = err
        if attempt < READ_ATTEMPTS:
            log(f"… محاولة {attempt}/{READ_ATTEMPTS} فشلت ({err}) — إعادة بعد {READ_BACKOFF}ث")
            time.sleep(READ_BACKOFF)
    return [], last_err


# ════════════════════════════════════════════════════════════════════
#  كاش الموظفين والإعدادات (توفير القراءات)
# ════════════════════════════════════════════════════════════════════
_cache = {"users": None, "settings": None, "at": 0.0}


def build_user_map(db):
    """يطابق User ID في جهاز البصمة مع حقل empId في مجموعة users."""
    umap, dupes = {}, []
    for doc in db.collection("users").stream():
        d = doc.to_dict() or {}
        emp_id = str(d.get("empId", "")).strip()
        if not emp_id:
            continue
        if emp_id in umap:
            dupes.append(emp_id)
        umap[emp_id] = {
            "uid": doc.id,
            "name": d.get("name", ""),
            "empId": emp_id,
            "department": d.get("department", ""),
        }
    if dupes:
        log(f"⚠️ أرقام وظيفية مكرّرة (ستُنسب البصمة لآخر موظف): {sorted(set(dupes))}")
    return umap


def get_settings(db):
    doc = db.collection("settings").document("config").get()
    return (doc.to_dict() or {}) if doc.exists else {}


def get_cached(db, force=False):
    if force or _cache["users"] is None or (time.time() - _cache["at"]) > CACHE_SECONDS:
        _cache["users"] = build_user_map(db)
        _cache["settings"] = get_settings(db)
        _cache["at"] = time.time()
        log(f"↻ تحديث البيانات: {len(_cache['users'])} موظف لهم رقم وظيفي.")
    return _cache["users"], _cache["settings"]


def shift_label(settings, dow):
    shifts = (settings or {}).get("shifts", {}) or {}
    s = shifts.get(str(dow)) or shifts.get(dow) or {}
    t = s.get("type")
    if not t or t == "off":
        return "راحة"
    kind = "مسائي" if t == "evening" else "صباحي"
    return f"{kind} {s.get('start','')}–{s.get('end','')}"


# ════════════════════════════════════════════════════════════════════
#  رفع بصمة واحدة
# ════════════════════════════════════════════════════════════════════
def push_punch(db, settings, user, punch_dt, punch_flag):
    """يرجع (تم_الرفع, سبب_التجاهل).

    منطق دخول/خروج: نعتمد على "التبديل" (toggle) لأن حقل الجهاز غير موثوق
    بين الموديلات — إن كانت هناك جلسة مفتوحة فهذه البصمة خروج، وإلا فهي دخول.
    حقل الجهاز (punch) يُستخدم كمرجّح فقط عند عدم وجود جلسة مفتوحة.
    """
    punch_dt = aware(punch_dt)
    date_str = punch_dt.strftime("%Y-%m-%d")
    dow = int(punch_dt.strftime("%w"))          # 0 = الأحد (مطابق لـ getDay في الواجهة)

    ref = db.collection(COLL_DEVICE).document(f"{user['uid']}_{date_str}")
    snap = ref.get()
    data = snap.to_dict() if snap.exists else None
    sessions = list((data or {}).get("sessions", []) or [])

    # آخر جلسة مفتوحة (دخول بلا خروج)
    open_idx = None
    for i in range(len(sessions) - 1, -1, -1):
        if not sessions[i].get("out"):
            open_idx = i
            break

    # ── منع التكرار: مقارنة صحيحة مع مراعاة المنطقة الزمنية ──
    for s in sessions:
        for key in ("in", "out"):
            prev = s.get(key)
            if not prev:
                continue
            prev = aware(prev if isinstance(prev, datetime.datetime) else None)
            if prev and abs((punch_dt - prev).total_seconds()) < MIN_GAP_SECONDS:
                return False, f"تكرار (فرق أقل من {MIN_GAP_SECONDS} ثانية)"

    if open_idx is not None:
        # جلسة مفتوحة → هذه البصمة خروج
        sessions[open_idx]["out"] = punch_dt
        sessions[open_idx]["outPunch"] = punch_flag
        action = "خروج"
    else:
        # لا جلسة مفتوحة → دخول جديد
        sessions.append({
            "in": punch_dt,
            "out": None,
            "inPunch": punch_flag,
            "source": "device",
        })
        action = "دخول"

    ref.set({
        "employeeUid": user["uid"],
        "employeeName": user["name"],
        "employeeEmpId": user["empId"],
        "department": user["department"],
        "date": date_str,
        "dow": dow,
        "shiftLabel": shift_label(settings, dow),
        "source": "device",
        "sessions": sessions,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    return True, action


# ════════════════════════════════════════════════════════════════════
#  دورة واحدة
# ════════════════════════════════════════════════════════════════════
def write_heartbeat(db, **fields):
    """نبض الجسر — لوحة الأدمن تعرض تحذيراً إن توقّف."""
    try:
        db.collection(BRIDGE_DOC[0]).document(BRIDGE_DOC[1]).set({
            "lastRun": firestore.SERVER_TIMESTAMP,
            "deviceIp": f"{ZK_IP}:{ZK_PORT}",
            **fields
        }, merge=True)
    except Exception as e:
        log(f"⚠️ تعذّر كتابة النبض: {e}")


def run_once(db, days_limit=None):
    users, settings = get_cached(db)

    logs, err = read_device()
    if err:
        log(f"❌ تعذّر الاتصال بالجهاز {ZK_IP}:{ZK_PORT} — {err}")
        write_heartbeat(db, deviceOk=False, error=err, newCount=0)
        return

    if not logs:
        log("⚠️ الاتصال بالجهاز نجح لكن سجل البصمات فارغ تماماً.")
        write_heartbeat(db, deviceOk=True, error="", newCount=0, readCount=0)
        return

    logs.sort(key=lambda r: r.timestamp)

    state = load_state()
    last_ts = None
    if state.get("last_ts"):
        try:
            last_ts = aware(datetime.datetime.fromisoformat(state["last_ts"]))
        except Exception:
            last_ts = None

    floor_ts = None
    if days_limit:
        floor_ts = datetime.datetime.now(TZ) - datetime.timedelta(days=days_limit)

    # ── العدّادات: صريحة حتى لا تظهر رسالة "لا بصمات جديدة" مضلّلة ──
    n_read = len(logs)
    n_new = n_ok = n_dup = n_unknown = 0
    unknown_ids = set()
    ok_upto = last_ts           # لا نُقدّم المؤشّر إلا على ما نجح فعلاً
    stop = False

    for rec in logs:
        ts = aware(rec.timestamp)
        if last_ts and ts <= last_ts:
            continue
        if floor_ts and ts < floor_ts:
            ok_upto = ts
            continue
        n_new += 1

        emp_id = str(rec.user_id).strip()
        user = users.get(emp_id)

        if not user:
            n_unknown += 1
            unknown_ids.add(emp_id)
            ok_upto = ts                 # مجهول = لا فائدة من إعادة المحاولة
            continue

        # pyzk: rec.punch = دخول/خروج ، rec.status = نوع التحقق (بصمة/كارت)
        # الكود القديم كان يقرأ status بالخطأ — وهذا سبب "لا بصمات جديدة"
        punch_flag = getattr(rec, "punch", None)
        if punch_flag is None:
            punch_flag = getattr(rec, "status", 0)

        try:
            ok, why = push_punch(db, settings, user, ts, punch_flag)
        except Exception as e:
            # فشل حقيقي (شبكة/صلاحيات) → نتوقّف ولا نُقدّم المؤشّر،
            # فتُعاد المحاولة في الدورة القادمة ولا تضيع أي بصمة.
            log(f"❌ فشل رفع بصمة {emp_id} @ {ts:%Y-%m-%d %H:%M} — {e}")
            log("   ⏸️ سيُعاد المحاولة في الدورة القادمة (لم تُفقد البصمة).")
            stop = True
            break

        if ok:
            n_ok += 1
            log(f"✔ {user['name']} ({emp_id}) — {why} {ts:%Y-%m-%d %H:%M}")
        else:
            n_dup += 1
            log(f"↷ {user['name']} ({emp_id}) — تُجوهلت: {why}")

        ok_upto = ts

    if ok_upto and (last_ts is None or ok_upto > last_ts):
        state["last_ts"] = ok_upto.isoformat()
        save_state(state)

    # ── تقرير واضح لا يكذب ──
    log(f"📊 قُرئ من الجهاز: {n_read} | جديدة: {n_new} | رُفعت: {n_ok}"
        f" | مكرّرة: {n_dup} | أرقام مجهولة: {n_unknown}"
        + ("  ⏸️(توقّف مؤقت)" if stop else ""))
    if unknown_ids:
        log(f"⚠️ أرقام وظيفية غير موجودة في النظام: {sorted(unknown_ids)}")
        log("   أضِف الرقم الوظيفي لهذا الموظف في «الموظفون» ثم انتظر دورة.")

    write_heartbeat(
        db, deviceOk=True, error="",
        readCount=n_read, newCount=n_ok, dupCount=n_dup,
        unknownIds=sorted(unknown_ids)[:20],
        employeeCount=len(users),
    )


# ════════════════════════════════════════════════════════════════════
#  وضع التشخيص — يطبع البصمات الخام بلا أي رفع
# ════════════════════════════════════════════════════════════════════
def debug_dump():
    print("═" * 68)
    print(f" وضع التشخيص — قراءة {ZK_IP}:{ZK_PORT} بلا رفع أي شيء")
    print("═" * 68)
    logs, err = read_device()
    if err:
        print(f"\n❌ تعذّر الاتصال: {err}\n")
        print("جرّب:")
        print(f"  • ping {ZK_IP}   من نفس الكمبيوتر")
        print("  • تأكد أن الكمبيوتر والجهاز على نفس الشبكة/الراوتر")
        print("  • غيّر ZK_FORCE_UDP = True في أعلى الملف")
        print("  • تأكد من ZK_PASSWORD (كلمة مرور الاتصال في إعدادات الجهاز)")
        return
    print(f"\n✅ الاتصال نجح. عدد السجلات في الجهاز: {len(logs)}\n")
    if not logs:
        print("⚠️ الجهاز متصل لكن سجل البصمات فارغ. تأكد أن بصمتك سُجّلت فعلاً")
        print("   (يظهر اسمك/رقمك على شاشة الجهاز عند البصم).")
        return

    logs.sort(key=lambda r: r.timestamp)
    print("آخر 25 بصمة (كما هي من الجهاز):")
    print("-" * 68)
    print(f"{'الرقم':>8} | {'الوقت':^19} | {'punch':>5} | {'status':>6}")
    print("-" * 68)
    for r in logs[-25:]:
        p = getattr(r, "punch", "—")
        s = getattr(r, "status", "—")
        print(f"{str(r.user_id):>8} | {r.timestamp:%Y-%m-%d %H:%M:%S} | {str(p):>5} | {str(s):>6}")
    print("-" * 68)

    newest = aware(logs[-1].timestamp)
    now = datetime.datetime.now(TZ)
    drift = (newest - now).total_seconds() / 60.0
    print(f"\n🕐 أحدث بصمة في الجهاز : {newest:%Y-%m-%d %H:%M:%S}")
    print(f"🕐 وقت هذا الكمبيوتر   : {now:%Y-%m-%d %H:%M:%S}")
    if drift > 10:
        print(f"\n⚠️ ساعة الجهاز متقدّمة ~{int(drift)} دقيقة عن الكمبيوتر.")
        print("   صحّح التاريخ والوقت في إعدادات جهاز البصمة، ثم نفّذ --reset.")
    elif drift < -10:
        print(f"\n⚠️ ساعة الجهاز متأخرة ~{int(-drift)} دقيقة عن الكمبيوتر.")
        print("   صحّح التاريخ والوقت في إعدادات جهاز البصمة.")
    else:
        print("\n✅ ساعة الجهاز مضبوطة.")

    st = load_state()
    print(f"\n📌 آخر بصمة رُفعت سابقاً (zk_state.json): {st.get('last_ts') or 'لا شيء'}")
    if st.get("last_ts"):
        try:
            lt = aware(datetime.datetime.fromisoformat(st["last_ts"]))
            fresh = [r for r in logs if aware(r.timestamp) > lt]
            print(f"   → عدد البصمات الأحدث منها: {len(fresh)}")
            if not fresh:
                print("   ⚠️ لا توجد بصمة أحدث. إن كنت بصمت للتو فساعة الجهاز خطأ،")
                print("      أو المؤشّر تقدّم بالخطأ. نفّذ:  python zk_bridge.py --reset --days 3")
        except Exception:
            pass

    ids = sorted({str(r.user_id).strip() for r in logs})
    print(f"\n👥 أرقام المستخدمين الموجودة في الجهاز: {ids[:40]}")
    print("   لازم يكون كل رقم منها مكتوباً في حقل «الرقم الوظيفي» لموظف في النظام.")
    print("\n" + "═" * 68)


# ════════════════════════════════════════════════════════════════════
#  main
# ════════════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description="جسر ZKTeco → Firebase")
    ap.add_argument("--debug", action="store_true", help="طباعة البصمات الخام بلا رفع")
    ap.add_argument("--once",  action="store_true", help="دورة واحدة ثم الخروج")
    ap.add_argument("--reset", action="store_true", help="تصفير ملف الحالة")
    ap.add_argument("--days",  type=int, default=None, help="مع --reset: ارفع آخر N يوم فقط")
    args = ap.parse_args()

    if args.debug:
        debug_dump()
        return

    if args.reset and os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)
        log("🧹 تم تصفير ملف الحالة.")

    log("🚀 بدء جسر ZKTeco → Firebase")
    log(f"   الجهاز: {ZK_IP}:{ZK_PORT} | كل {POLL_SECONDS} ثانية")
    log(f"   المجموعة: {COLL_DEVICE} (منفصلة عن سجل الموقع)")

    db = init_firebase()

    if args.once:
        run_once(db, days_limit=args.days)
        return

    if prevent_sleep():
        log("🌙 نوم النظام ممنوع ما دام الجسر يعمل (الشاشة تنام عادياً).")
    elif os.name == "nt":
        log("⚠️ تعذّر منع نوم النظام — طبّق setup-power.bat كمسؤول.")

    fails = 0
    try:
        while True:
            try:
                # ⚠️ يُعاد الطلب كل دورة: ويندوز يُسقط طلب البقاء مستيقظاً
                # عند بعض تغييرات خطة الطاقة أو بعد عودة من نوم أُجبر عليه.
                prevent_sleep()
                run_once(db, days_limit=args.days)
                fails = 0
            except KeyboardInterrupt:
                log("👋 إيقاف بناءً على طلب المستخدم.")
                return
            except Exception as e:
                fails += 1
                log(f"❌ خطأ عام ({fails}): {e}")
                traceback.print_exc()
            # تباطؤ تدريجي عند تكرار الأخطاء حتى لا يُغرق الشبكة والسجل
            time.sleep(min(POLL_SECONDS * max(1, fails), 600))
    finally:
        allow_sleep()


if __name__ == "__main__":
    main()
