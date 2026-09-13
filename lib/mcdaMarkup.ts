export const MCDA_MARKUP = String.raw`
<main class="app-shell">
<section aria-labelledby="mcda-main-title" class="hero">
<div class="hero-brand">
<div class="hero-logo-wrap">
<img alt="MCDA Multi-Criteria Decision Analysis logo" class="hero-logo" src="/mcda-logo.png"/>
</div>
</div>
<div class="hero-copy">
<div class="eyebrow">MCDA Decision Support Platform</div>
<h1 id="mcda-main-title">Multi - Criteria Decision Analysis</h1>
<p>เครื่องมือสนับสนุนการตัดสินใจแบบหลายเกณฑ์แบบ Extended Multi-Method รองรับ 13 โมเดลที่คำนวณได้จาก Decision Matrix ปัจจุบัน พร้อม Technique Library จากเอกสารอ้างอิง Comparative Ranking และ Sensitivity Analysis ภายใต้ชุดน้ำหนักเดียวกัน</p>
<div aria-label="ความสามารถหลัก" class="hero-meta">
<span class="hero-badge">Excel Import</span>
<span class="hero-badge">TOPSIS</span>
<span class="hero-badge">SAW</span>
<span class="hero-badge">PROMETHEE</span>
<span class="hero-badge">VIKOR</span>
<span class="hero-badge">MOORA</span>
<span class="hero-badge">WASPAS</span>
<span class="hero-badge">EDAS</span>
<span class="hero-badge">Comparative Ranking</span>
<span class="hero-badge accent">Sensitivity Analysis</span>
</div>
</div>
</section>
<section aria-label="ขั้นตอนการใช้งาน" class="workflow">
<div class="step"><div class="step-no">1</div><div><strong>ระบุข้อมูล / Import Excel</strong><span>กรอกข้อมูลบนเว็บ หรือใช้ Master Excel Format</span></div></div>
<div class="step"><div class="step-no">2</div><div><strong>กำหนดน้ำหนัก</strong><span>น้ำหนักรวมของทุกปัจจัยต้องเท่ากับ 100%</span></div></div>
<div class="step"><div class="step-no">3</div><div><strong>เลือก Cost / Benefit</strong><span>กำหนดทิศทางค่าที่พึงประสงค์ของแต่ละปัจจัย</span></div></div>
<div class="step"><div class="step-no">4</div><div><strong>เลือกโมเดลและจัดอันดับ</strong><span>เลือกได้หลายวิธีจาก 13 โมเดลในชุดเดียวกัน พร้อมคำอธิบายสั้น ๆ ในแต่ละกล่องเพื่อช่วยเลือกเทคนิค</span></div></div>
<div class="step"><div class="step-no">5</div><div><strong>Comparative Sensitivity</strong><span>คำนวณโมเดลที่เลือกซ้ำใน Loop น้ำหนักเดียวกัน พร้อม Legend ตารางกลางเพียงชุดเดียว</span></div></div>
<div class="step"><div class="step-no">6</div><div><strong>Export และดาวน์โหลด</strong><span>PDF, CSV และ Excel จะเข้าสู่โฟลเดอร์ Downloads ของเบราว์เซอร์</span></div></div>
</section>
<section class="grid">
<div class="panel">
<div class="panel-head">
<div>
<h2>1. ตารางข้อมูลทางเลือก</h2>
<p>แถว = ทางเลือก · คอลัมน์ = ปัจจัยที่ใช้พิจารณา</p>
</div>
<div class="toolbar">
<button class="btn primary" id="importExcelBtn">Import Excel</button>
<button class="btn" id="downloadMasterBtn">ดาวน์โหลด Master Excel</button>
<button class="btn" id="addAlternativeBtn">+ เพิ่มทางเลือก</button>
<button class="btn" id="addCriterionBtn">+ เพิ่มปัจจัย</button>
<input accept=".xlsx,.xls,.xlsm,.xlsb,.csv" class="file-input" id="excelFileInput" type="file"/>
</div>
</div>
<div class="panel-body">
<div class="table-wrap" id="matrixWrap"></div>
<div class="callout" id="downloadFolderNotice"><strong>การดาวน์โหลด:</strong> เมื่อกดปุ่มดาวน์โหลด ระบบจะส่งไฟล์ไปยังโฟลเดอร์ <strong>Downloads</strong> ตามการตั้งค่าของเบราว์เซอร์โดยอัตโนมัติ หากเบราว์เซอร์ตั้งค่า “ถามตำแหน่งบันทึกทุกครั้ง” จะปรากฏหน้าต่างเลือกตำแหน่งแทน</div>
<details class="master-help">
<summary>Master Excel Format สำหรับ Import</summary>
<div class="master-help-body">
              แถว = ทางเลือก · คอลัมน์ B เป็นต้นไป = ปัจจัย · แถวที่ 2 = น้ำหนัก (%) · แถว “ประเภท” เป็นตัวเลือก (ถ้าไม่มี ระบบกำหนด Benefit ให้ก่อน)
              <div class="master-help-grid">
<table>
<thead><tr><th>ทางเลือก</th><th>ปัจจัย 1</th><th>ปัจจัย 2</th><th>ปัจจัย 3</th></tr></thead>
<tbody>
<tr><td><b>น้ำหนัก (%)</b></td><td>40</td><td>35</td><td>25</td></tr>
<tr><td><b>ประเภท (ไม่บังคับ)</b></td><td>Benefit</td><td>Cost</td><td>Benefit</td></tr>
<tr><td>ทางเลือก A</td><td>10</td><td>5</td><td>8</td></tr>
<tr><td>ทางเลือก B</td><td>8</td><td>4</td><td>9</td></tr>
</tbody>
</table>
</div>
<div class="import-status" id="importStatus">รองรับ .xlsx, .xls, .xlsm, .xlsb และ .csv</div>
</div>
</details>
<div class="footer-note">คลิกชื่อทางเลือกหรือชื่อปัจจัยเพื่อแก้ไขได้ทันที</div>
</div>
</div>
<aside class="panel">
<div class="panel-head">
<div>
<h2>2–3. น้ำหนักและเกณฑ์</h2>
<p>กำหนดค่าน้ำหนักและประเภทของแต่ละปัจจัย</p>
</div>
</div>
<div class="panel-body">
<div class="config-list" id="criterionConfig"></div>
<div class="weight-status bad" id="weightStatus">
<span>ผลรวมน้ำหนัก</span><span class="weight-sum" id="weightSum">0.00%</span>
</div>
<div class="callout">
<b>Benefit:</b> ค่ายิ่งสูงยิ่งดี  ·  <b>Cost:</b> ค่ายิ่งต่ำยิ่งดี<br/>
<b>Models ที่ใช้กับ Decision Matrix ปัจจุบัน:</b> 13 วิธีถูกจัดเป็น 3 กลุ่มตาม <b>เป้าหมายการวิเคราะห์</b> ได้แก่ คะแนนรวม/Utility, Reference–Ideal–Compromise และ Outranking พร้อมโทนสีแยกแต่ละกลุ่ม<br/><span style="font-size:10.5px;color:#667085">การจัดกลุ่มช่วยเลือกวิธีตามคำถามที่ต้องการตอบ แต่ยังเลือกหลายวิธีข้ามกลุ่มได้ วิธีที่ต้องใช้ข้อมูลคนละโครงสร้าง เช่น AHP/ANP, DEMATEL, SWARA, LINMAP, DEA, fuzzy methods, ELECTRE variants และ MODM ยังคงอยู่ใน Technique Library ด้านล่าง</span>
</div>
<div class="model-picker">
<div class="model-button-head">
<label><b>เลือกโมเดลที่ต้องการวิเคราะห์และแสดงผล</b> <span style="font-weight:500;color:#667085">(เลือกได้หลายโมเดล)</span></label>
<button class="model-select-all" id="selectAllModelsBtn" type="button">เลือกทั้งหมด</button>
</div>
<div aria-label="คำอธิบายโทนสีของกลุ่มโมเดล" class="model-purpose-key">
<span><i class="purpose-dot aggregate"></i>คะแนนรวม / Utility</span>
<span><i class="purpose-dot reference"></i>Reference / Ideal / Compromise</span>
<span><i class="purpose-dot outranking"></i>Outranking</span>
</div>
<div aria-label="เลือกโมเดล MCDA แบ่งตามเป้าหมายการวิเคราะห์" class="model-analysis-groups" id="modelButtonWrap" role="group">
<section aria-labelledby="modelGroupAggregate" class="model-group aggregate">
<div class="model-group-head">
<div class="model-group-title">
<span class="model-group-index">1</span>
<div><strong id="modelGroupAggregate">Aggregate Score &amp; Utility — สรุปคะแนนรวมและอรรถประโยชน์</strong><span>เป้าหมาย: รวมผลหลายเกณฑ์เป็นคะแนนเดียวเพื่อเปรียบเทียบและจัดอันดับทางเลือกแบบ complete ranking</span></div>
</div>
<span class="model-group-badge">5 models · โทนน้ำเงิน</span>
</div>
<div class="model-group-grid">
<button aria-pressed="true" class="model-toggle active" data-model="saw" title="SAW: รวมคะแนนที่ปรับมาตรฐานแล้วถ่วงด้วยน้ำหนักเกณฑ์" type="button"><span class="model-name">SAW</span><span class="mini">ผลรวมคะแนนถ่วงน้ำหนัก</span></button>
<button aria-pressed="true" class="model-toggle active" data-model="moora" title="MOORA: เปรียบเทียบผลรวมเกณฑ์ Benefit กับ Cost หลัง normalization" type="button"><span class="model-name">MOORA</span><span class="mini">Benefit − Cost แบบ Ratio</span></button>
<button aria-pressed="true" class="model-toggle active" data-model="waspas" title="WASPAS: ผสม Weighted Sum Model และ Weighted Product Model" type="button"><span class="model-name">WASPAS</span><span class="mini">Weighted Sum + Weighted Product</span></button>
<button aria-pressed="false" class="model-toggle" data-model="copras" title="COPRAS: ประเมินความสำคัญเชิงสัดส่วนโดยรวมเกณฑ์ Benefit และ Cost" type="button"><span class="model-name">COPRAS</span><span class="mini">Proportional Benefit / Cost</span></button>
<button aria-pressed="false" class="model-toggle" data-model="wpm" title="WPM: รวมประโยชน์ด้วยผลคูณของคะแนนที่ยกกำลังตามน้ำหนักเกณฑ์" type="button"><span class="model-name">WPM</span><span class="mini">Weighted Product</span></button>
</div>
</section>
<section aria-labelledby="modelGroupReference" class="model-group reference">
<div class="model-group-head">
<div class="model-group-title">
<span class="model-group-index">2</span>
<div><strong id="modelGroupReference">Reference, Ideal &amp; Compromise — เปรียบเทียบกับเป้าหมาย/จุดอ้างอิง</strong><span>เป้าหมาย: พิจารณาความใกล้ Ideal, Reference หรือ Average solution และหาทางเลือกที่เป็น compromise ที่เหมาะสม</span></div>
</div>
<span class="model-group-badge">6 models · โทนม่วง</span>
</div>
<div class="model-group-grid">
<button aria-pressed="true" class="model-toggle active" data-model="topsis" title="TOPSIS: เลือกทางเลือกที่ใกล้ Positive Ideal และไกล Negative Ideal" type="button"><span class="model-name">TOPSIS</span><span class="mini">ใกล้ Ideal · ไกล Anti-ideal</span></button>
<button aria-pressed="true" class="model-toggle active" data-model="vikor" title="VIKOR: หา Compromise Solution โดยพิจารณา Group Utility และ Individual Regret" type="button"><span class="model-name">VIKOR</span><span class="mini">Compromise solution · Q ต่ำดีกว่า</span></button>
<button aria-pressed="true" class="model-toggle active" data-model="edas" title="EDAS: ประเมินระยะบวกและลบของแต่ละทางเลือกเมื่อเทียบกับ Average Solution" type="button"><span class="model-name">EDAS</span><span class="mini">ระยะจาก Average Solution</span></button>
<button aria-pressed="false" class="model-toggle" data-model="gra" title="GRA: วัดความใกล้เคียงของแต่ละทางเลือกกับ Reference Sequence ด้วย Grey Relational Grade" type="button"><span class="model-name">GRA</span><span class="mini">ใกล้ Reference Sequence</span></button>
<button aria-pressed="false" class="model-toggle" data-model="aras" title="ARAS: ประเมิน Utility ของแต่ละทางเลือกเมื่อเทียบกับทางเลือกอุดมคติ" type="button"><span class="model-name">ARAS</span><span class="mini">Utility เทียบ Ideal Alternative</span></button>
<button aria-pressed="false" class="model-toggle" data-model="distance" title="DISTANCE TARGET: จัดอันดับจากระยะถ่วงน้ำหนักถึงเป้าหมายอุดมคติ" type="button"><span class="model-name">DISTANCE TARGET</span><span class="mini">ระยะถึง Ideal Target</span></button>
</div>
</section>
<section aria-labelledby="modelGroupOutranking" class="model-group outranking">
<div class="model-group-head">
<div class="model-group-title">
<span class="model-group-index">3</span>
<div><strong id="modelGroupOutranking">Outranking — วิเคราะห์ความเหนือกว่าระหว่างคู่ทางเลือก</strong><span>เป้าหมาย: ตรวจว่าทางเลือกหนึ่ง “เหนือกว่า” อีกทางเลือกมากน้อยเพียงใด โดยใช้ pairwise preference / concordance–discordance</span></div>
</div>
<span class="model-group-badge">2 models · โทนเขียว</span>
</div>
<div class="model-group-grid">
<button aria-pressed="true" class="model-toggle active" data-model="promethee" title="PROMETHEE II: เปรียบเทียบทางเลือกแบบ Outranking และสรุปด้วย Net Flow" type="button"><span class="model-name">PROMETHEE II</span><span class="mini">Outranking · Net Flow สูงดีกว่า</span></button>
<button aria-pressed="false" class="model-toggle" data-model="electre" title="ELECTRE I: Outranking จาก Concordance และ Discordance ระหว่างคู่ทางเลือก" type="button"><span class="model-name">ELECTRE I</span><span class="mini">Concordance / Discordance</span></button>
</div>
</section>
</div>
<div class="model-selection-summary" id="modelSelectionSummary">เลือกแล้ว: TOPSIS + SAW + PROMETHEE II + VIKOR + MOORA + WASPAS + EDAS</div>
<small>โทนสีแบ่งตาม <b>เป้าหมายหลักของการวิเคราะห์</b> เพื่อช่วยเลือกวิธีที่เหมาะกับคำถามการตัดสินใจ โดยยังสามารถเลือกข้ามกลุ่มและใช้หลายโมเดลพร้อมกันได้ ผล Ranking, Heatmap และ Sensitivity จะแสดงเฉพาะโมเดลที่เลือกและคำนวณตามสูตรของแต่ละวิธีแยกจากกัน</small>
<div class="vikor-v-control" id="vikorVControl">
<div class="vikor-v-head"><strong>VIKOR — ค่า v (Strategy Weight)</strong><span class="vikor-v-value" id="vikorVDisplay">0.50</span></div>
<div class="vikor-v-row">
<input aria-label="ค่า v ของ VIKOR" id="vikorVRange" max="1" min="0" step="0.01" type="range" value="0.50"/>
<input aria-label="กรอกค่า v ของ VIKOR" class="vikor-v-number" id="vikorVNumber" max="1" min="0" step="0.01" type="number" value="0.50"/>
</div>
<div class="vikor-v-scale"><span>v = 0 · เน้น Individual Regret (R)</span><span>v = 1 · เน้น Group Utility (S)</span></div>
<small class="vikor-v-help">ค่าเริ่มต้น v = 0.50 · การเปลี่ยน v สามารถเปลี่ยนค่า Q และลำดับ VIKOR ได้ โดย Sensitivity น้ำหนักจะใช้ค่า v ที่กำหนดนี้คงที่ตลอดทุก Loop</small>
</div>
<div class="vikor-v-control" id="waspasLambdaControl">
<div class="vikor-v-head"><strong>WASPAS — ค่า λ (WSM/WPM Mixing)</strong><span class="vikor-v-value" id="waspasLambdaDisplay">0.50</span></div>
<div class="vikor-v-row">
<input aria-label="ค่า lambda ของ WASPAS" id="waspasLambdaRange" max="1" min="0" step="0.01" type="range" value="0.50"/>
<input aria-label="กรอกค่า lambda ของ WASPAS" class="vikor-v-number" id="waspasLambdaNumber" max="1" min="0" step="0.01" type="number" value="0.50"/>
</div>
<div class="vikor-v-scale"><span>λ = 0 · ใช้ WPM 100%</span><span>λ = 1 · ใช้ WSM 100%</span></div>
<small class="vikor-v-help">ค่าเริ่มต้น λ = 0.50 · Q = λ·WSM + (1−λ)·WPM · การเปลี่ยน λ สามารถเปลี่ยนคะแนนและลำดับ WASPAS ได้ โดย Sensitivity น้ำหนักจะใช้ λ ที่กำหนดนี้คงที่ตลอดทุก Loop</small>
</div>
</div>
<div class="actions">
<button class="btn primary" id="analyzeBtn">วิเคราะห์โมเดลที่เลือก + Sensitivity</button>
<button class="btn" id="resetBtn">คืนค่าตัวอย่าง Excel</button>
</div>
<div aria-live="polite" class="generation-progress" id="generationProgress">
<div class="generation-progress-head">
<div><div class="generation-progress-title">สถานะการ Generate</div><div class="generation-progress-stage" id="generationStage">พร้อมเริ่มการวิเคราะห์</div></div>
<div class="generation-progress-percent" id="generationPercent">0%</div>
</div>
<div aria-label="ความคืบหน้าการวิเคราะห์" aria-valuemax="100" aria-valuemin="0" aria-valuenow="0" class="generation-track" id="generationTrack" role="progressbar"><div class="generation-fill" id="generationFill"></div></div>
<div class="generation-progress-meta"><span id="generationDetail">ยังไม่ได้เริ่ม Generate</span><span><strong>เวลา:</strong> <span id="generationElapsed">0.0 วินาที</span></span></div>
</div>
</div>
</aside>
</section>
<section class="panel technique-library" id="techniqueLibraryPanel">
<div class="panel-head">
<div>
<h2>Technique Library — วิธีตัดสินใจจากเอกสารอ้างอิง</h2>
<p>รวบรวมวิธีจาก taxonomy 56 MCDA methods, หนังสือ MCDM 17 techniques และ fuzzy MADM/MODM classification · แยกวิธีที่คำนวณได้ด้วยข้อมูลปัจจุบันออกจากวิธีที่ต้องใช้ input เพิ่ม</p>
</div>
</div>
<div class="panel-body">
<details class="master-help">
<summary>เปิดรายการวิธีทั้งหมดและสถานะการรองรับ</summary>
<div class="master-help-body">
<div class="technique-library-tools">
<input aria-label="ค้นหาเทคนิค MCDM" class="technique-search" id="techniqueSearch" placeholder="ค้นหา เช่น ELECTRE, AHP, fuzzy, Goal Programming…" type="search"/>
<span class="technique-stats" id="techniqueStats"></span>
</div>
<div id="techniqueLibraryArea"></div>
<div class="model-reference-note"><b>หลักการเพิ่มวิธี:</b> ระบบเปิดเป็นปุ่มวิเคราะห์เฉพาะวิธีที่ใช้ Decision Matrix + Weight + Benefit/Cost ชุดเดียวกับหน้าปัจจุบันได้อย่างสมเหตุสมผล ส่วน AHP/ANP, DEMATEL, SWARA, LINMAP, DEA, fuzzy/grey-integral, ELECTRE variants, sorting และ MODM ต้องมี pairwise matrix, causal matrix, fuzzy numbers, thresholds, classes, goals/constraints หรือข้อมูลเฉพาะวิธี จึงถูกเก็บเป็น add-on library เพื่อเพิ่ม input module อย่างถูกต้องในขั้นถัดไป</div>
</div>
</details>
</div>
</section>
<section class="panel results">
<div class="panel-head">
<div>
<h2>4. ผลการวิเคราะห์และ Ranking</h2>
<p>Dynamic MCDA dashboard: แสดง Ranking score, Ranking table, Heatmap และการเปรียบเทียบเฉพาะโมเดลที่เลือก</p>
</div>
<div class="toolbar">
<button class="btn" disabled="" id="exportBtn">ดาวน์โหลดผล CSV</button>
<button class="btn pdf" disabled="" id="exportPdfBtn">บันทึกรายงาน PDF (TOPSIS)</button>
</div>
</div>
<div class="panel-body" id="resultsArea">
<div class="empty-state">กรอกข้อมูลให้ครบ ตรวจสอบว่าน้ำหนักรวมเท่ากับ 100% แล้วกด “วิเคราะห์โมเดลที่เลือก + Sensitivity”</div>
</div>
</section>
<section class="panel narrative-panel" id="narrativePanel">
<div class="panel-head">
<div>
<h2>5. การแปลผลแบบพรรณนา</h2>
<p>สรุปและตีความผล MCDA จากโมเดลที่เลือก ร่วมกับ Ranking, ความสอดคล้องระหว่างโมเดล และ Sensitivity Analysis ประมาณ 500–1000 คำ</p>
</div>
</div>
<div class="panel-body" id="narrativeArea">
<div class="narrative-empty">คำแปลผลแบบพรรณนาจะถูกสร้างใหม่ทุกครั้งที่กด “วิเคราะห์โมเดลที่เลือก + Sensitivity”</div>
</div>
</section>
<section class="panel" id="pdfSavePanel" style="display:none">
<div class="panel-head">
<div>
<h2>6. สถานะรายงาน PDF</h2>
<p id="pdfSaveMeta">ยังไม่มีรายงานที่บันทึก</p>
</div>
<div class="toolbar">
<button class="btn" id="pdfPrintFallbackBtn" style="display:none" type="button">เปิดรายงานสำหรับ Print / Save as PDF</button>
</div>
</div>
<div class="panel-body">
<div class="callout" id="pdfSaveStatus">
          Chrome / Edge: ระบบจะเปิดหน้าต่าง Save File ที่โฟลเดอร์ Downloads ก่อน แล้วเขียนไฟล์ PDF ลงปลายทางโดยตรง ไม่ใช้ Blob download หรือ Data URL download
        </div>
</div>
</section>
<section class="panel sensitivity-panel">
<div class="panel-head">
<div>
<h2>7. Sensitivity Analysis</h2>
<p>5.1 ระบุปัจจัยน้ำหนักสูงสุด · 5.2 เพิ่มทีละ 10 percentage points และเฉลี่ยลดจากปัจจัยอื่นเท่า ๆ กัน · กราฟและตารางแสดงเฉพาะโมเดลที่เลือก · ใช้ Legend ตารางกลางเพียงชุดเดียวสำหรับทุกกราฟ</p>
</div>
<div class="toolbar"><button class="btn" disabled="" id="exportSensitivityBtn">ดาวน์โหลดข้อมูล Loop เป็น CSV</button></div>
</div>
<div class="panel-body" id="sensitivityArea">
<div class="empty-state">ผล Sensitivity จะแสดงหลังจากกด “วิเคราะห์โมเดลที่เลือก + Sensitivity”</div>
</div>
</section>
</main>
<div aria-live="polite" class="toast" id="toast" role="status"></div>



<!-- Build: 2026-09-13-mcda-multimethod-grayscale-sensitivity-fullscreen-v23 -->
`;
