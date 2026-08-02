@echo off
chcp 65001 >nul
REM ════════════════════════════════════════════════════════════════════
REM  منع نوم الجهاز — الطبقة الأولى من علاج «كل ما نام الجهاز توقف الجسر»
REM
REM  ⚠️ شغّله بزر يمين ← "Run as administrator"
REM
REM  الجسر نفسه يطلب من ويندوز البقاء مستيقظاً (SetThreadExecutionState)،
REM  لكن هذا الطلب قد تتجاوزه سياسة المجموعة أو خطة طاقة مقيّدة. الطبقتان
REM  معاً حتى لا يعتمد رفع بصمات الشركة على إعداد واحد.
REM
REM  الشاشة والقرص يُتركان ينامان — لا علاقة لهما بعمل الجسر.
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

echo.
echo ═══ ضبط الطاقة لجسر البصمة ═══
echo.

REM 0 = بلا حد (لا ينام أبداً) — على الكهرباء
powercfg /change standby-timeout-ac 0
echo   [+] نوم النظام            : معطّل
powercfg /change hibernate-timeout-ac 0
echo   [+] الإسبات (hibernate)   : معطّل
powercfg /change disk-timeout-ac 0
echo   [+] نوم القرص             : معطّل

REM الشاشة تنام عادياً — لا تؤثر على الجسر وتوفّر الكهرباء
powercfg /change monitor-timeout-ac 15
echo   [+] الشاشة                : تنام بعد 15 دقيقة (لا يضر)

REM ⚠️ النوم السريع (Fast Startup) يجعل "إيقاف التشغيل" إسباتاً مقنّعاً،
REM    فلا تبدأ الخدمات بشكل نظيف عند التشغيل التالي.
powercfg /hibernate off >nul 2>&1
echo   [+] Fast Startup          : معطّل

echo.
echo ═══ تم ═══
echo.
echo   يبقى شيء واحد يدوي — إدارة طاقة كرت الشبكة:
echo.
echo     Device Manager ^> Network adapters ^> [كرت الشبكة] ^> Properties
echo     ^> تبويب Power Management
echo     ^> أزل علامة "Allow the computer to turn off this device to save power"
echo.
echo   بدونه قد يُطفأ الكرت وحده فينقطع الجسر والجهاز مستيقظ.
echo.
pause
