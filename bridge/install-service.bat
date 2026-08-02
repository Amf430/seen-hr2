@echo off
chcp 65001 >nul
setlocal
REM ════════════════════════════════════════════════════════════════════
REM  تثبيت الجسر كخدمة ويندوز عبر NSSM
REM
REM  ⚠️ شغّله بزر يمين ← "Run as administrator"
REM
REM  لماذا خدمة لا نافذة Terminal:
REM    • تبدأ مع إقلاع الجهاز بلا تسجيل دخول أحد
REM    • تعيد تشغيل نفسها تلقائياً إن تعطّل السكربت
REM    • لا يقتلها إغلاق نافذة بالخطأ ولا تسجيل الخروج
REM
REM  المتطلّب: NSSM من https://nssm.cc/download
REM            فُكّ الضغط وضع nssm.exe بجوار هذا الملف (أو في PATH).
REM ════════════════════════════════════════════════════════════════════

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo.
  echo   [!] لازم تشغّل هذا الملف كمسؤول Administrator
  echo.
  pause
  exit /b 1
)

set "SVC=SeenZKBridge"
set "HERE=%~dp0"
set "NSSM=%HERE%nssm.exe"

if not exist "%NSSM%" (
  where nssm.exe >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   [!] لم أجد nssm.exe
    echo       نزّله من https://nssm.cc/download وضع nssm.exe في:
    echo       %HERE%
    echo.
    pause
    exit /b 1
  )
  set "NSSM=nssm.exe"
)

REM ── إيجاد بايثون ──
REM ⚠️ pythonw.exe لا python.exe: الأخير يفتح نافذة سوداء لكل خدمة.
for /f "delims=" %%P in ('where pythonw.exe 2^>nul') do set "PY=%%P" & goto :found
for /f "delims=" %%P in ('where python.exe  2^>nul') do set "PY=%%P" & goto :found
echo.
echo   [!] لم أجد بايثون في PATH. ثبّته من python.org وفعّل "Add to PATH".
echo.
pause
exit /b 1
:found

if not exist "%HERE%zk_bridge.py" (
  echo   [!] zk_bridge.py غير موجود بجوار هذا الملف.
  pause
  exit /b 1
)
if not exist "%HERE%serviceAccountKey.json" (
  echo.
  echo   [!] serviceAccountKey.json غير موجود بجوار zk_bridge.py
  echo       بدونه لن تتمكّن الخدمة من الكتابة في Firestore.
  echo.
  pause
  exit /b 1
)

echo.
echo ═══ تثبيت خدمة %SVC% ═══
echo   بايثون : %PY%
echo   المجلد : %HERE%
echo.

REM إزالة أي نسخة سابقة حتى تكون العملية قابلة للتكرار بلا خطأ
"%NSSM%" stop   "%SVC%" >nul 2>&1
"%NSSM%" remove "%SVC%" confirm >nul 2>&1

"%NSSM%" install "%SVC%" "%PY%" "%HERE%zk_bridge.py"
"%NSSM%" set "%SVC%" AppDirectory "%HERE%"
"%NSSM%" set "%SVC%" DisplayName "Seen HR - ZKTeco Bridge"
"%NSSM%" set "%SVC%" Description "يرفع بصمات جهاز ZKTeco إلى Firestore لنظام إدارة الموارد البشرية"
"%NSSM%" set "%SVC%" Start SERVICE_AUTO_START

REM ── إعادة التشغيل التلقائي عند التعطّل ──
"%NSSM%" set "%SVC%" AppExit Default Restart
"%NSSM%" set "%SVC%" AppRestartDelay 15000
REM لا تعتبرها "بدأت بنجاح" إلا بعد 10 ثوانٍ — يمنع حلقة إعادة تشغيل سريعة
"%NSSM%" set "%SVC%" AppThrottle 10000

REM ── السجلّات: بلا هذا لا تعرف لماذا توقّفت الخدمة ──
if not exist "%HERE%logs" mkdir "%HERE%logs"
"%NSSM%" set "%SVC%" AppStdout "%HERE%logs\bridge.log"
"%NSSM%" set "%SVC%" AppStderr "%HERE%logs\bridge.log"
REM تدوير السجل عند 10 ميغا حتى لا يمتلئ القرص بصمت
"%NSSM%" set "%SVC%" AppRotateFiles 1
"%NSSM%" set "%SVC%" AppRotateOnline 1
"%NSSM%" set "%SVC%" AppRotateBytes 10485760

REM ⚠️ يجب أن تعمل كـ LocalSystem: حساب المستخدم يعني توقّف الخدمة عند
REM    تسجيل خروجه، وهو نصف المشكلة التي نحلّها أصلاً.
"%NSSM%" set "%SVC%" ObjectName LocalSystem

"%NSSM%" start "%SVC%"

echo.
echo ═══ تم ═══
echo.
echo   الحالة    : sc query %SVC%
echo   السجل     : %HERE%logs\bridge.log
echo   إيقاف     : nssm stop %SVC%
echo   تشغيل     : nssm start %SVC%
echo   إزالة     : nssm remove %SVC% confirm
echo.
echo   لا تنسَ setup-power.bat لمنع نوم الجهاز.
echo.
pause
