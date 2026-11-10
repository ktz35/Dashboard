param([string]$Out)
$rng = New-Object System.Random 42
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inv = [System.Globalization.CultureInfo]::InvariantCulture

function Rnd([double]$a, [double]$b) { return $a + $rng.NextDouble() * ($b - $a) }
function Q([string]$s) { if ($s -match '[",;\n]') { return '"' + ($s -replace '"', '""') + '"' } return $s }

function WriteDataset($name, $title, $source, $status, $updated, $header, $rows) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("// Набор данных «$title». Формат: CSV по шаблону из PRD, раздел 5.")
  [void]$sb.AppendLine("// Чтобы заменить данные: вставьте свой CSV между обратными кавычками или загрузите файл в блоке «О данных и показателях».")
  [void]$sb.AppendLine("registerDataset('$name', {")
  [void]$sb.AppendLine("  title: '$title',")
  [void]$sb.AppendLine("  source: '$source',")
  [void]$sb.AppendLine("  status: '$status',")
  [void]$sb.AppendLine("  updated: '$updated',")
  [void]$sb.Append("  csv: ``")
  [void]$sb.AppendLine($header)
  foreach ($r in $rows) { [void]$sb.AppendLine($r) }
  [void]$sb.AppendLine("``")
  [void]$sb.AppendLine("});")
  [System.IO.File]::WriteAllText((Join-Path $Out "$name.js"), $sb.ToString(), $utf8)
}

$dates = @()
$start = [datetime]'2026-10-27'
for ($i = 0; $i -lt 14; $i++) { $dates += $start.AddDays($i).ToString('yyyy-MM-dd') }
$last = $dates[13]

# Общий фактор дня: один провальный день по сети
function DayFactor($d) { if ($d -eq '2026-11-03') { return 0.84 } return 1.0 }

$terminals = @(
  @{ st = 'Станция Достык'; t = 'КедентрансСервис'; o = 'Наша компания'; c = 'Контейнеры, металл'; p = 9000 },
  @{ st = 'Станция Достык'; t = 'Евротрансгрупп'; o = 'Наша компания'; c = 'Зерно, масличные'; p = 7000 },
  @{ st = 'Станция Достык'; t = 'Евротранзит'; o = 'Наша компания'; c = 'Контейнеры'; p = 6000 },
  @{ st = 'Станция Достык'; t = 'Достык Транс Терминал'; o = 'Наша компания'; c = 'Нефтепродукты, химия'; p = 8000 },
  @{ st = 'Станция Достык'; t = 'Атасу'; o = 'Сторонняя компания'; c = 'Контейнеры, генеральные грузы'; p = 9000 },
  @{ st = 'Станция Алтынколь'; t = 'Терминал Алтынколь-1 (усл.)'; o = 'Наша компания'; c = 'Контейнеры'; p = 11000 },
  @{ st = 'Станция Алтынколь'; t = 'Терминал Алтынколь-2 (усл.)'; o = 'Наша компания'; c = 'Зерно'; p = 7000 },
  @{ st = 'Станция Алтынколь'; t = 'Частный терминал (усл.)'; o = 'Сторонняя компания'; c = 'Контейнеры, автомобили'; p = 10000 }
)

$sites = @(
  @{ o = 'Терминал Алматы'; p = 3500 },
  @{ o = 'Сухой порт Хоргос'; p = 5000 },
  @{ o = 'Контейнерный хаб Актау'; p = 2500 },
  @{ o = 'Порт Актау'; p = 9000 },
  @{ o = 'Терминал АМСТ'; p = 1800 },
  @{ o = 'Порт Курык'; p = 4000 },
  @{ o = 'Порт Ляньюньган'; p = 6000 },
  @{ o = 'Порт Сиань'; p = 3000 }
)

$stRows = @()
$stationSum = @{}
foreach ($d in $dates) {
  foreach ($t in $terminals) {
    $f = (Rnd 0.86 1.10) * (DayFactor $d)
    if ($t.t -eq 'Атасу' -and $d -ge '2026-11-07') { $f = $f * 0.88 }
    $fact = [math]::Round($t.p * $f / 10) * 10
    $stRows += ($d, $t.st, (Q $t.t), $t.o, (Q $t.c), $t.p, $fact) -join ','
    $k = "$d|$($t.st)"
    if (-not $stationSum.ContainsKey($k)) { $stationSum[$k] = @(0, 0) }
    $stationSum[$k] = @(($stationSum[$k][0] + $t.p), ($stationSum[$k][1] + $fact))
  }
}

$thRows = @()
foreach ($d in $dates) {
  foreach ($st in @('Станция Достык', 'Станция Алтынколь')) {
    $v = $stationSum["$d|$st"]
    $thRows += ($d, $st, $v[0], $v[1]) -join ','
  }
  foreach ($s in $sites) {
    $f = (Rnd 0.84 1.09) * (DayFactor $d)
    if ($s.o -eq 'Сухой порт Хоргос' -and $d -ge '2026-11-07') { $f = Rnd 0.74 0.82 }
    if ($s.o -eq 'Порт Актау' -and $d -eq $last) { $f = 0.81 }
    if ($s.o -eq 'Порт Курык' -and $d -eq $last) { $f = 1.06 }
    $fact = [math]::Round($s.p * $f / 10) * 10
    $thRows += ($d, $s.o, $s.p, $fact) -join ','
  }
}

WriteDataset 'station_terminals' 'Перевалка терминалов станций' 'Ежедневные отчёты терминалов (Excel)' 'Демо' '2026-11-10T07:30' 'date,station,terminal,owner_type,cargo,plan_t,fact_t' $stRows
WriteDataset 'throughput' 'Перевалка по суткам' 'Корпоративная система / отчёты терминалов' 'Демо' '2026-11-10T07:30' 'date,object,plan_t,fact_t' $thRows

# Вагоны
$types = @(
  @{ t = 'Полувагон'; c = @('Уголь', 'Металлопрокат', 'Руда') },
  @{ t = 'Крытый'; c = @('Зерно в мешках', 'Генеральный груз', 'Бумага') },
  @{ t = 'Платформа'; c = @('Контейнеры 40 фт', 'Контейнеры 20 фт', 'Автомобили') },
  @{ t = 'Цистерна'; c = @('Дизельное топливо', 'Бензин', 'Сжиженный газ') },
  @{ t = 'Хоппер'; c = @('Зерно', 'Цемент', 'Удобрения') }
)
$places = @('Станция Достык', 'Станция Алтынколь', 'Терминал Алматы', 'Сухой порт Хоргос', 'Порт Актау', 'Порт Курык', 'Контейнерный хаб Актау', 'Терминал АМСТ')
$routesOnWay = @('Перегон Актогай — Достык', 'Перегон Алматы — Алтынколь', 'Перегон Мангышлак — Актау', 'Перегон Бейнеу — Курык', 'Перегон Шу — Алматы', 'Перегон Арысь — Сарыагаш')
$dests = @('Порт Актау', 'Порт Курык', 'Станция Достык', 'Станция Алтынколь', 'Терминал Алматы', 'Ташкент (УЗБ)', 'Бандар-Аббас (Иран)', 'Баку (АЗЕ)', 'Сухой порт Хоргос')
$statusPlan = @(('В пути', 12), ('На станции', 8), ('Под погрузкой', 6), ('Под выгрузкой', 6), ('Простой', 9))

$wRows = @()
$used = @{}
foreach ($sp in $statusPlan) {
  for ($i = 0; $i -lt $sp[1]; $i++) {
    do { $num = (@('5', '6', '9')[$rng.Next(3)]) + $rng.Next(1000000, 9999999).ToString() } while ($used.ContainsKey($num))
    $used[$num] = 1
    $ty = $types[$rng.Next($types.Count)]
    $cargo = $ty.c[$rng.Next($ty.c.Count)]
    $status = $sp[0]
    if ($status -eq 'В пути') { $loc = $routesOnWay[$rng.Next($routesOnWay.Count)] } else { $loc = $places[$rng.Next($places.Count)] }
    if ($status -eq 'Простой') {
      $pick = @('Станция Достык', 'Станция Достык', 'Сухой порт Хоргос', 'Сухой порт Хоргос', 'Порт Актау', 'Станция Алтынколь', 'Терминал Алматы')
      $loc = $pick[$rng.Next($pick.Count)]
    }
    do { $dest = $dests[$rng.Next($dests.Count)] } while ($dest -eq $loc)
    switch ($status) {
      'Простой' { $idle = [math]::Round((Rnd 1 7.5), 1) }
      'На станции' { $idle = [math]::Round((Rnd 0.2 2.2), 1) }
      'В пути' { $idle = 0 }
      default { $idle = [math]::Round((Rnd 0.1 1.5), 1) }
    }
    if ($status -eq 'Простой') { $eta = '' } else { $eta = ([datetime]'2026-11-10').AddDays($rng.Next(0, 6)).ToString('yyyy-MM-dd') }
    $wRows += ($num, $ty.t, (Q $cargo), $status, (Q $loc), (Q $dest), $idle.ToString($inv), $eta) -join ','
  }
}
WriteDataset 'wagons' 'Дислокация вагонов' 'ЭТРАН / АСУ КТЖ / система оператора' 'Демо' '2026-11-10T06:00' 'wagon,type,cargo,status,location,destination,idle_days,eta' $wRows
