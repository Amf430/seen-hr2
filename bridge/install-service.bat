@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
REM ════════════════════════════════════════════════════════════════════
REM  تثبيت الجسر كخدمة ويندوز عبر NSSM
REM
REM  ⚠️ شغّله بزر يمين ← "Run as administrator"
REM
REM  ⚠️⚠️ البايثون: لا يُبحث عنه في PATH إطلاقاً.
REM
REM   جهاز البصمة في الشركة عليه بايثون قديم يشغّل برنامج ZKTeco الرسمي،
REM   وهو أول ما يجده PATH. تثبيت الخدمة عليه يعني:
REM     • فشلاً صامتاً — pyzk و firebase-admin غير مثبّتين فيه
REM     • أو أسوأ: عبثاً ببيئة البرنامج الذي تعتمد عليه الشركة
REM
REM   لذلك المسار يُحدَّد صراحةً، ويُفحص قبل التثبيت.
REM
REM  طريقة التحديد (بالترتيب):
REM     1) معامل:            install-service.bat "D:\python\pythonw.exe"
REM     2) ملف بجوار السكربت: python-path.txt   يحوي المسار في سطر واحد
REM     3) مجلد python\ بجوار السكربت (نسخة محمولة موضوعة هنا)
REM
REM  المتطلّب الآخر: NSSM من https://nssm.cc/download  ← ضع nssm.exe هنا
REM ════════════════════════════════════════════════════════════════════

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo.
  echo   [!] لازم تشغّل هذا الملف كمسؤول Administrator
  echo       زر يمين على الملف ثم "Run as administrator"
  echo.
  pause
  exit /b 1
)

set "SVC=SeenZKBridge"
set "HERE=%~dp0"
set "PY="

REM ── 1) معامل صريح ──
if not "%~1"=="" set "PY=%~1"

REM ── 2) python-path.txt ──
if not defined PY if exist "%HERE%python-path.txt" (
  for /f "usebackq delims=" %%L in ("%HERE%python-path.txt") do (
    if not defined PY set "PY=%%L"
  )
)

REM ── 3) نسخة محمولة داخل مجلد python\ ──
if not defined PY if exist "%HERE%python\pythonw.exe" set "PY=%HERE%python\pythonw.exe"
if not defined PY if exist "%HERE%python\python.exe"  set "PY=%HERE%python\python.exe"

if not defined PY (
  echo.
  echo   [!] لم يُحدَّد مسار بايثون — ولن أبحث في PATH عمداً.
  echo.
  echo       PATH على هذا الجهاز يشير غالباً للبايثون القديم الذي يشغّل
  echo       برنامج البصمة الرسمي. استعماله يكسر الخدمة أو يعبث ببيئته.
  echo.
  echo   حدّده بإحدى طريقتين:
  echo.
  echo     أ) شغّل الملف ومعه المسار:
  echo        install-service.bat "D:\PortablePython\pythonw.exe"
  echo.
  echo     ب) أنشئ ملف python-path.txt بجوار هذا الملف يحوي سطراً واحداً:
  echo        D:\PortablePython\pythonw.exe
  echo.
  echo   لمعرفة مسار نسختك المحمولة، افتح موجّه الأوامر داخل مجلدها ونفّذ:
  echo        cd
  echo.
  pause
  exit /b 1
)

if not exist "%PY%" (
  echo.
  echo   [!] المسار غير موجود:  %PY%
  echo.
  pause
  exit /b 1
)

REM ⚠️ pythonw.exe لا python.exe — الأخير يفتح نافذة سوداء تبقى مفتوحة.
echo %PY% | find /i "pythonw.exe" >nul
if errorlevel 1 (
  for %%F in ("%PY%") do set "PYDIR=%%~dpF"
  if exist "!PYDIR!pythonw.exe" (
    set "PY=!PYDIR!pythonw.exe"
    echo   [i] استُبدل python.exe بـ pythonw.exe ^(بلا نافذة^)
  )
)

echo.
echo ═══ فحص قبل التثبيت ═══
echo   بايثون : %PY%
echo   المجلد : %HERE%
echo.

REM ── فحص المكتبات على نفس البايثون الذي ستعمل به الخدمة ──
REM    ⚠️ هذا الفحص هو الفرق بين خطأ واضح الآن وخدمة تفشل صامتة لأسبوع.
REM    نستعمل python.exe للفحص لأن pythonw لا يطبع شيئاً.
set "PYC=%PY%"
echo %PYC% | find /i "pythonw.exe" >nul
if not errorlevel 1 (
  for %%F in ("%PY%") do set "PYDIR=%%~dpF"
  if exist "!PYDIR!python.exe" set "PYC=!PYDIR!python.exe"
)

"%PYC%" -c "import zk, firebase_admin" 2>nul
if errorlevel 1 (
  echo   [!] المكتبات ناقصة على هذا البايثون تحديداً.
  echo.
  echo       ثبّتها عليه هو ^(لا على بايثون النظام^):
  echo.
  echo         "%PYC%" -m pip install pyzk firebase-admin
  echo.
  pause
  exit /b 1
)
echo   [+] pyzk و firebase-admin موجودتان

if not exist "%HERE%zk_bridge.py" (
  echo   [!] zk_bridge.py غير موجود بجوار هذا الملف.
  pause
  exit /b 1
)
echo   [+] zk_bridge.py

if not exist "%HERE%serviceAccountKey.json" (
  echo.
  echo   [!] serviceAccountKey.json غير موجود بجوار zk_bridge.py
  echo       بدونه لن تتمكّن الخدمة من الكتابة في Firestore.
  echo.
  pause
  exit /b 1
)
echo   [+] serviceAccountKey.json

REM ── NSSM ──
set "NSSM=%HERE%nssm.exe"
if not exist "%NSSM%" (
  where nssm.exe >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   [!] لم أجد nssm.exe — نزّله من https://nssm.cc/download
    echo       وضع nssm.exe في:  %HERE%
    echo.
    pause
    exit /b 1
  )
  set "NSSM=nssm.exe"
)
echo   [+] nssm.exe

echo.
echo ═══ تثبيت خدمة %SVC% ═══
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
REM لا تُعتبر "بدأت بنجاح" إلا بعد 10 ثوانٍ — يمنع حلقة إعادة تشغيل سريعة
"%NSSM%" set "%SVC%" AppThrottle 10000

REM ── السجلّات: بلا هذا لا تعرف لماذا توقّفت الخدمة ──
if not exist "%HERE%logs" mkdir "%HERE%logs"
"%NSSM%" set "%SVC%" AppStdout "%HERE%logs\bridge.log"
"%NSSM%" set "%SVC%" AppStderr "%HERE%logs\bridge.log"
REM تدوير السجل عند 10 ميغا حتى لا يمتلئ القرص بصمت
"%NSSM%" set "%SVC%" AppRotateFiles 1
"%NSSM%" set "%SVC%" AppRotateOnline 1
"%NSSM%" set "%SVC%" AppRotateBytes 10485760

REM ⚠️ LocalSystem مقصود: حساب المستخدم يعني توقّف الخدمة عند تسجيل خروجه،
REM    وهو نصف المشكلة التي نحلّها أصلاً.
REM ⚠️ وبما أن البايثون محمول، AppDirectory أعلاه ضروري: بدونه لا يجد
REM    السكربت serviceAccountKey.json ولا يكتب zk_state.json في مكانه.
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
echo   افتح السجل بعد دقيقة وتأكد أنه يقول "بدء جسر ZKTeco".
echo   ولا تنسَ setup-power.bat لمنع نوم الجهاز.
echo.
pause
