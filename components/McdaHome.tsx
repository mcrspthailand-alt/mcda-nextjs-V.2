import type { CSSProperties, ReactNode } from 'react';

const timeline = [
  {
    era: 'ก่อนยุคแบบจำลอง',
    year: 'Antiquity → 18th C.',
    title: 'จาก “การชั่งน้ำหนักด้วยสัญชาตญาณ” สู่ Moral Algebra',
    text: 'การตัดสินใจหลายเกณฑ์มีรากจากการชั่งข้อดี–ข้อเสียในชีวิตจริงมาอย่างยาวนาน เอกสารของ Thakkar ยกเรื่องเล่าเกี่ยวกับ King Solomon และต่อมาคือ Benjamin Franklin ซึ่งใช้วิธีแบ่งกระดาษเป็นเหตุผล “เห็นด้วย/ไม่เห็นด้วย” แล้วหักล้างข้อที่มีน้ำหนักใกล้เคียงกัน วิธีนี้ถูกเรียกว่า Moral Algebra และสะท้อนแนวคิดพื้นฐานของการเปรียบเทียบ trade-off ก่อนที่จะมีสมการ MCDA อย่างเป็นทางการ',
    tone: '#7c5c2f',
  },
  {
    era: 'Social Choice',
    year: '1785',
    title: 'Condorcet และ Borda: การรวมความชอบของหลายคน',
    text: 'ปัญหาการลงคะแนนทำให้เกิดคำถามสำคัญว่า เมื่อแต่ละคนมีลำดับความชอบของตนเอง เราจะรวมความชอบเหล่านั้นเป็นผลของกลุ่มอย่างไร Condorcet เน้นการเปรียบเทียบแบบตัวต่อตัว ขณะที่ Borda ใช้คะแนนตามอันดับ แนวคิดเหล่านี้เป็นบรรพบุรุษของการจัดอันดับและความสัมพันธ์แบบ outranking ในเวลาต่อมา',
    tone: '#5f6f52',
  },
  {
    era: 'Welfare Economics',
    year: 'Late 19th → 1906',
    title: 'Edgeworth และ Pareto: จุดเริ่มต้นเชิงคณิตศาสตร์',
    text: 'งานด้านเศรษฐศาสตร์สวัสดิการของ Francis Edgeworth และ Vilfredo Pareto วางรากฐานให้การพิจารณาหลายเป้าหมายอย่างเป็นระบบ ทั้ง indifference curve, Edgeworth box และ Pareto optimality ซึ่งถามว่าเราจะปรับปรุงทางเลือกหนึ่งได้หรือไม่โดยไม่ทำให้อีกมิติหนึ่งแย่ลง แนวคิด “ไม่มีทางเลือกใดครอบงำได้ทั้งหมด” กลายเป็นแกนสำคัญของ multi-objective decision making',
    tone: '#315a95',
  },
  {
    era: 'Operations Research',
    year: '1951–1955',
    title: 'Optimization และ Goal Programming',
    text: 'Kuhn–Tucker conditions ช่วยวางพื้นฐานให้ nonlinear optimization และการวิเคราะห์หลายวัตถุประสงค์ ขณะที่ Charnes, Cooper และ Ferguson พัฒนา Goal Programming เพื่อหาคำตอบที่ “น่าพอใจ” เมื่อมีหลายเป้าหมายที่ขัดแย้งกัน แทนที่จะคาดหวังคำตอบเดียวที่ดีที่สุดในทุกมิติพร้อมกัน',
    tone: '#315a95',
  },
  {
    era: 'European School',
    year: 'Mid-1960s',
    title: 'Bernard Roy และ ELECTRE: กำเนิด outranking',
    text: 'ELECTRE เปลี่ยนมุมมองจากการรวมทุกอย่างให้เป็นคะแนนเดียว ไปสู่คำถามว่า “มีหลักฐานเพียงพอหรือไม่ที่จะกล่าวว่า A ดีกว่า B” พร้อมยอมรับความไม่เปรียบเทียบกันของบางทางเลือก แนวคิดนี้กลายเป็นรากของ European school และต่อยอดไปสู่กลุ่ม outranking เช่น PROMETHEE',
    tone: '#6941c6',
  },
  {
    era: 'Fuzzy Decision',
    year: '1965 → 1970s',
    title: 'Zadeh, Bellman และการตัดสินใจภายใต้ความคลุมเครือ',
    text: 'Zadeh เสนอ fuzzy sets ในปี 1965 และ Bellman–Zadeh นำแนวคิด fuzzy goals กับ fuzzy constraints เข้าสู่การตัดสินใจในปี 1970 ทำให้ข้อมูลเชิงภาษา ความคลุมเครือ และความไม่แน่นอนของมนุษย์สามารถเข้าสู่แบบจำลองได้ ต่อมางานของ Baas–Kwakernaak, Yager และนักวิจัยจำนวนมากผลักดัน fuzzy MCDM ให้เติบโตอย่างรวดเร็ว',
    tone: '#9b6b17',
  },
  {
    era: 'Preference Modelling',
    year: '1970s–1980s',
    title: 'AHP, Utility/Value Theory และ TOPSIS',
    text: 'Thomas Saaty ทำให้การเปรียบเทียบเป็นคู่และลำดับชั้นเป็นเครื่องมือที่ผู้ใช้เข้าใจง่ายผ่าน AHP; Keeney–Raiffa พัฒนาสาย multi-attribute value/utility; และ Hwang–Yoon ทำให้แนวคิด “ใกล้จุดอุดมคติ–ไกลจุดเลวร้าย” เป็นที่รู้จักผ่าน TOPSIS วิธีเหล่านี้ช่วยเชื่อมระหว่างข้อมูลเชิงปริมาณกับ judgment ของผู้ตัดสินใจ',
    tone: '#183b70',
  },
  {
    era: 'Method Proliferation',
    year: '1990s → 2010s',
    title: 'จากหนึ่งวิธี สู่ครอบครัวของวิธี',
    text: 'เมื่อโจทย์จริงซับซ้อนขึ้น มีทั้ง VIKOR, ANP, DEMATEL, MOORA, COPRAS, ARAS, WASPAS, SWARA, fuzzy extensions และ hybrid methods จำนวนมาก ความก้าวหน้าทำให้ MCDA ทรงพลังขึ้น แต่ก็สร้าง “meta-decision problem” ใหม่ คือ จะเลือกวิธีใดให้เหมาะกับลักษณะของปัญหา',
    tone: '#18794e',
  },
  {
    era: 'Method Selection & DSS',
    year: '2010s → present',
    title: 'MCDA กลายเป็นระบบสนับสนุนการตัดสินใจ',
    text: 'งานของ Watróbski และคณะวิเคราะห์ 56 วิธีและสร้างกรอบคัดเลือกวิธีจากคุณลักษณะของโจทย์ เช่น ชนิดน้ำหนัก สเกลข้อมูล ความไม่แน่นอน และรูปแบบผลลัพธ์ งานยุคใหม่จึงไม่เพียง “คำนวณอันดับ” แต่ยังให้ความสำคัญกับ sensitivity, robustness, uncertainty และการเลือกวิธีให้สอดคล้องกับโจทย์จริง',
    tone: '#0f766e',
  },
];

const principles = [
  {
    title: 'หลายเกณฑ์มักขัดแย้งกัน',
    text: 'ต้นทุนต่ำอาจสวนทางกับคุณภาพสูง ความเร็วอาจสวนทางกับความปลอดภัย ประสิทธิภาพอาจสวนทางกับผลกระทบสิ่งแวดล้อม MCDA มีหน้าที่ทำให้ trade-off เหล่านี้มองเห็นและตรวจสอบได้',
  },
  {
    title: 'ไม่มี “วิธีเดียวที่ดีที่สุด” สำหรับทุกปัญหา',
    text: 'วิธีต่างกันใช้ตรรกะต่างกัน ทั้งการชดเชย (compensatory), ระยะห่างจาก ideal solution, outranking, utility/value, pairwise comparison และ causal structure จึงให้ผลต่างกันได้แม้ใช้ข้อมูลชุดเดียวกัน',
  },
  {
    title: 'ความชอบของมนุษย์เป็นส่วนหนึ่งของแบบจำลอง',
    text: 'น้ำหนัก เกณฑ์ threshold ลำดับความสำคัญ และความยอมรับความเสี่ยง ล้วนสะท้อน preference structure ของผู้ตัดสินใจ เป้าหมายไม่ใช่แทนที่มนุษย์ แต่ทำให้เหตุผลเบื้องหลังการตัดสินใจโปร่งใสขึ้น',
  },
  {
    title: 'ความไม่แน่นอนต้องถูกจัดการอย่างเป็นระบบ',
    text: 'โลกจริงมีข้อมูลไม่ครบ คำอธิบายเชิงภาษา และ judgment ที่ไม่แม่นยำ จึงเกิด fuzzy MCDM, grey systems, stochastic approaches และ sensitivity analysis เพื่อดูว่าคำตอบเสถียรเพียงใดเมื่อสมมติฐานเปลี่ยน',
  },
];

const methods = [
  { family: 'Value / Utility', names: 'SAW · AHP · MAUT/MAVT · SMART', note: 'รวมผลการประเมินด้วย value/utility หรือ weighted aggregation' },
  { family: 'Ideal-point / Compromise', names: 'TOPSIS · VIKOR · MOORA · COPRAS · ARAS · WASPAS', note: 'วัดความใกล้–ไกลจาก solution ที่ต้องการ หรือสร้าง compromise solution' },
  { family: 'Outranking', names: 'ELECTRE · PROMETHEE', note: 'เปรียบเทียบทางเลือกเป็นคู่ และยอมรับกรณีที่บางทางเลือก “เปรียบเทียบกันไม่ได้”' },
  { family: 'Uncertainty-aware', names: 'Fuzzy AHP · Fuzzy TOPSIS · Fuzzy VIKOR · Grey methods', note: 'แทนความคลุมเครือและข้อมูลไม่สมบูรณ์ด้วย fuzzy/grey representation' },
  { family: 'Structure / Causality', names: 'DEMATEL · ANP · ISM · GTA', note: 'ใช้เมื่อตัวแปรมีความสัมพันธ์หรืออิทธิพลต่อกัน ไม่ได้เป็นเพียงรายการเกณฑ์อิสระ' },
  { family: 'Hybrid / Intelligent', names: 'AHP–TOPSIS · DANP · Fuzzy–AI · DSS', note: 'ผสานหลายวิธีหรือใช้ระบบผู้เชี่ยวชาญ/AI เพื่อรองรับปัญหาซับซ้อนและการตัดสินใจแบบโต้ตอบ' },
];

export default function McdaHome({ onOpenAnalysis }: { onOpenAnalysis: () => void }) {
  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.heroGlowA} />
        <div style={styles.heroGlowB} />
        <div style={styles.heroContent}>
          <div style={styles.eyebrow}>THE BRIEF HISTORY OF MCDA</div>
          <h1 style={styles.heroTitle}>จาก “การชั่งใจ” ของมนุษย์<br />สู่ศาสตร์การตัดสินใจหลายเกณฑ์</h1>
          <p style={styles.heroLead}>
            Multi-Criteria Decision Analysis (MCDA) หรือ Multi-Criteria Decision Making (MCDM)
            คือกรอบคิดสำหรับปัญหาที่ไม่มีคำตอบดีที่สุดเพียงมิติเดียว แต่ต้องพิจารณาหลายเกณฑ์ หลายความเห็น
            และหลายข้อจำกัดพร้อมกัน หน้านี้สรุปพัฒนาการสำคัญจากเอกสารอ้างอิง 3 ชุดที่แนบมา
            ตั้งแต่รากฐานด้านเศรษฐศาสตร์และ Operations Research ไปจนถึง fuzzy decision,
            outranking, hybrid methods และระบบสนับสนุนการตัดสินใจสมัยใหม่
          </p>
          <div style={styles.heroActions}>
            <button type="button" onClick={onOpenAnalysis} style={styles.primaryButton}>
              เปิด MCDA Analysis →
            </button>
            <a href="#history" style={styles.secondaryButton}>ดูเส้นเวลาประวัติศาสตร์</a>
          </div>
          <div style={styles.heroStats}>
            <Stat value="หลายศตวรรษ" label="จาก intuitive trade-off สู่ formal decision science" />
            <Stat value="56 methods" label="ถูกจัดหมวดในกรอบคัดเลือกของ Watróbski et al." />
            <Stat value="MADM + MODM" label="สองสายหลักของการตัดสินใจหลายเกณฑ์" />
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          kicker="WHY MCDA"
          title="ทำไมศาสตร์นี้จึงสำคัญ"
          text="ปัญหาจริงแทบไม่เคยมีเกณฑ์เดียว การตัดสินใจที่ดีจึงต้องอธิบายให้ได้ว่าเราเลือกอะไร ให้ความสำคัญกับอะไร และผลลัพธ์เปลี่ยนหรือไม่เมื่อสมมติฐานเปลี่ยน"
        />
        <div style={styles.cardGrid}>
          {principles.map((item, index) => (
            <article key={item.title} style={styles.ideaCard}>
              <div style={styles.ideaNumber}>{String(index + 1).padStart(2, '0')}</div>
              <h3 style={styles.cardTitle}>{item.title}</h3>
              <p style={styles.cardText}>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="history" style={{ ...styles.section, ...styles.historySection }}>
        <SectionHeader
          kicker="HISTORICAL MILESTONES"
          title="The Brief History of MCDA"
          text="เส้นเวลานี้เรียบเรียงจากบท Historical Milestones in MCDM, บท Historical Background of Fuzzy MCDM และบทความว่าด้วยการเลือกวิธี MCDA เพื่อให้เห็นว่าศาสตร์นี้พัฒนาจากการชั่งข้อดี–ข้อเสีย สู่การสร้างแบบจำลอง preference, optimization, uncertainty และ decision support systems อย่างไร"
        />
        <div style={styles.timeline}>
          {timeline.map((item, index) => (
            <div key={`${item.year}-${item.title}`} style={styles.timelineRow}>
              <div style={styles.timelineRail}>
                <span style={{ ...styles.timelineDot, background: item.tone }} />
                {index < timeline.length - 1 ? <span style={styles.timelineLine} /> : null}
              </div>
              <article style={styles.timelineCard}>
                <div style={styles.timelineMeta}>
                  <span style={{ ...styles.timelineEra, color: item.tone }}>{item.era}</span>
                  <span style={styles.timelineYear}>{item.year}</span>
                </div>
                <h3 style={styles.timelineTitle}>{item.title}</h3>
                <p style={styles.timelineText}>{item.text}</p>
              </article>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          kicker="VISUAL HISTORY"
          title="ภาพแนวคิดสำคัญจากเอกสารอ้างอิง"
          text="แผนภาพด้านล่างวาดใหม่จากตารางและรูปใน PDF ที่แนบมา เพื่อให้เหมาะกับการอ่านบนเว็บและยังคงสาระของภาพต้นฉบับ"
        />
        <div style={styles.visualGrid}>
          <FigureCard
            title="Historical timeline of MCDM"
            caption="เรียบเรียงใหม่จาก Thakkar (2021), Table 1.6 — แสดงการเปลี่ยนผ่านจาก Moral Algebra, optimization และ goal programming ไปสู่ ELECTRE, interactive methods, AHP/ANP และ behavioural decision theory"
          >
            <HistoryTimelineFigure />
          </FigureCard>
          <FigureCard
            title="MCDM method landscape"
            caption="เรียบเรียงใหม่จาก Thakkar (2021), Fig. 1.10 — วิธีสมัยใหม่ไม่ได้แยกขาดจากกัน แต่พัฒนาและผสานแนวคิดจากหลายครอบครัว เช่น outranking, cause-effect และ hybrid methods"
          >
            <MethodLandscapeFigure />
          </FigureCard>
          <FigureCard
            title="Fuzzy MCDM → Intelligent decision support"
            caption="เรียบเรียงใหม่จาก Kahraman (2008), บท Intelligent Fuzzy MCDM — เมื่อข้อมูลและ preference มีความคลุมเครือ งานวิจัยจึงเชื่อม fuzzy MCDM เข้ากับ expert systems, neural networks, search methods และ AI"
          >
            <FuzzyAiFigure />
          </FigureCard>
          <FigureCard
            title="Selecting the right MCDA method"
            caption="เรียบเรียงใหม่จาก Watróbski et al. (2019), Fig. 1–2 — การเลือกวิธีกลายเป็นปัญหาการตัดสินใจอีกชั้นหนึ่ง โดยพิจารณาชนิดน้ำหนัก สเกลข้อมูล ความไม่แน่นอน และรูปแบบผลลัพธ์ที่ต้องการ"
          >
            <MethodSelectionFigure />
          </FigureCard>
        </div>
      </section>

      <section style={{ ...styles.section, ...styles.splitSection }}>
        <div style={styles.splitCopy}>
          <div style={styles.kicker}>FROM MCDM TO MCDA</div>
          <h2 style={styles.sectionTitle}>จากการ “หาคำตอบ” สู่การ “อธิบายเหตุผลของคำตอบ”</h2>
          <p style={styles.bodyText}>
            เอกสารของ Thakkar แบ่งปัญหา multi-criteria ออกเป็นสองสายใหญ่: <b>MADM</b> สำหรับทางเลือกที่มีจำนวนจำกัดและกำหนดไว้แล้ว
            และ <b>MODM</b> สำหรับปัญหาการออกแบบ/optimization ที่มี decision space ต่อเนื่องหรือมีทางเลือกจำนวนมาก
            ในทางปฏิบัติคำว่า MCDM และ MCDA มักใช้ทับซ้อนกัน แต่คำว่า “analysis” ช่วยย้ำว่ากระบวนการไม่ได้จบที่สูตรคำนวณ
            หากรวมถึงการกำหนดโจทย์ เลือกเกณฑ์ สร้าง preference structure ตรวจสอบความสอดคล้อง วิเคราะห์ sensitivity
            และตีความผลเพื่อสร้างข้อเสนอแนะที่นำไปใช้ได้จริง
          </p>
          <p style={styles.bodyText}>
            ประเด็นนี้สำคัญมาก เพราะ Watróbski และคณะชี้ว่า MCDA methods จำนวนมากสามารถให้ ranking ที่ต่างกันเมื่อใช้กับข้อมูลเดียวกัน
            ความแตกต่างเกิดจากวิธีจัดการน้ำหนัก การ normalize การชดเชยระหว่างเกณฑ์ การนิยาม ideal/anti-ideal
            หรือ threshold และพารามิเตอร์ภายใน ดังนั้น “เลือกวิธีผิด” อาจทำให้คำแนะนำมีคุณภาพต่ำลง แม้คำนวณถูกทุกขั้นตอนก็ตาม
          </p>
        </div>
        <div style={styles.quotePanel}>
          <div style={styles.quoteMark}>“</div>
          <p style={styles.quoteText}>
            MCDA ไม่ได้มีหน้าที่บอกว่าโลกมีคำตอบเดียว แต่ช่วยให้ผู้ตัดสินใจเห็นว่า
            <b> ทำไม</b> ทางเลือกหนึ่งจึงเหมาะกว่าอีกทางเลือกหนึ่ง ภายใต้เกณฑ์ ความชอบ
            และข้อจำกัดที่ประกาศไว้อย่างชัดเจน
          </p>
          <div style={styles.quoteFoot}>แนวคิดสรุปจากเอกสารทั้งสามชุด</div>
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          kicker="METHOD FAMILIES"
          title="พัฒนาการของ MCDA สะท้อนผ่านครอบครัวของวิธี"
          text="แทนที่จะจำสูตรแยกเป็นรายวิธี การมองเป็นครอบครัวช่วยให้เข้าใจว่าแต่ละเทคนิคตอบคำถามคนละแบบ และเหตุใดจึงควรเปรียบเทียบผลหลายวิธีในปัญหาสำคัญ"
        />
        <div style={styles.methodGrid}>
          {methods.map((item) => (
            <article key={item.family} style={styles.methodCard}>
              <div style={styles.methodFamily}>{item.family}</div>
              <h3 style={styles.methodNames}>{item.names}</h3>
              <p style={styles.cardText}>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ ...styles.section, ...styles.fuzzySection }}>
        <div style={styles.kicker}>UNCERTAINTY & INTELLIGENCE</div>
        <h2 style={styles.sectionTitle}>เมื่อโลกจริงไม่ “crisp” — Fuzzy, Grey, AI และ Sensitivity จึงเข้ามา</h2>
        <div style={styles.twoCol}>
          <div>
            <p style={styles.bodyText}>
              Kahraman อธิบายว่า classic MCDM มักสมมติให้ข้อมูล เกณฑ์ และน้ำหนักมีค่าแน่นอน แต่ปัญหาจริงเต็มไปด้วยคำว่า
              “ค่อนข้างดี”, “เสี่ยงสูง”, “สำคัญมากกว่าเล็กน้อย” หรือข้อมูลที่ยังไม่ครบ Fuzzy set theory จึงเปิดทางให้ระดับความเป็นสมาชิก
              (membership) อยู่ระหว่าง 0–1 แทนการบังคับโลกให้เป็นเพียง true/false แนวคิดนี้ทำให้ fuzzy AHP, fuzzy TOPSIS,
              fuzzy outranking และ fuzzy optimization เติบโตอย่างรวดเร็ว
            </p>
            <p style={styles.bodyText}>
              ต่อมา AI และ intelligent optimization ถูกนำมาช่วยเรียนรู้ membership function, จัดการ preference เชิงภาษา,
              ค้นหา solution space ขนาดใหญ่ และสร้าง decision support system ที่โต้ตอบกับผู้ใช้ได้ จุดนี้เชื่อมโยงโดยตรงกับระบบ MCDA บนเว็บยุคใหม่:
              ผู้ใช้ไม่ควรเห็นเพียงอันดับสุดท้าย แต่ควรเห็น sensitivity, robustness และผลจากหลายโมเดลเพื่อประเมินความมั่นคงของข้อสรุป
            </p>
          </div>
          <div style={styles.miniFlow}>
            <FlowNode label="Problem + Criteria" />
            <FlowArrow />
            <FlowNode label="Preference / Weights" />
            <FlowArrow />
            <FlowNode label="Uncertainty Model" highlight />
            <FlowArrow />
            <FlowNode label="MCDA / Hybrid Method" />
            <FlowArrow />
            <FlowNode label="Sensitivity + Interpretation" highlight />
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          kicker="MCDA IN SUSTAINABLE URBAN MOBILITY"
          title="จากประวัติศาสตร์ของศาสตร์ สู่การตัดสินใจด้านเมืองและการขนส่ง"
          text="งานด้านการขนส่งเป็นตัวอย่างคลาสสิกของปัญหา multi-criteria เพราะต้องพิจารณาเวลาเดินทาง ต้นทุน ความปลอดภัย สิ่งแวดล้อม การเข้าถึง ความเท่าเทียม และผลกระทบต่อชุมชนพร้อมกัน"
        />
        <div style={styles.transportGrid}>
          <article style={styles.transportMain}>
            <h3 style={styles.transportTitle}>SUMR Unit × MCDA</h3>
            <p style={styles.bodyText}>
              หน่วยวิจัยการขนส่งในเมืองอย่างยั่งยืน (Sustainable Urban Mobility Research Unit: SUMR Unit)
              สังกัดสาขาวิชาวิศวกรรมโยธา คณะวิศวกรรมศาสตร์ มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น
              จัดตั้งขึ้นเพื่อพัฒนางานวิจัย นวัตกรรม และบริการวิชาการด้านการขนส่งและการพัฒนาเมือง โดยบริบทของขอนแก่นมีความสำคัญในฐานะศูนย์กลางเศรษฐกิจ
              การศึกษา และโครงข่ายคมนาคมของภาคตะวันออกเฉียงเหนือและอนุภูมิภาคลุ่มน้ำโขง
            </p>
            <p style={styles.bodyText}>
              เว็บไซต์ของหน่วยวิจัยยังแสดงผลงานที่ประยุกต์ multi-criteria decision making กับการจัดลำดับความสำคัญของทางแยก
              และการประเมินระบบขนส่งเมืองอย่างยั่งยืน ซึ่งสะท้อนบทบาทของ MCDA ในการเปลี่ยนข้อมูลจากหลายมิติให้กลายเป็น
              “เหตุผลเชิงนโยบาย” ที่ตรวจสอบและสื่อสารได้
            </p>
            <a
              href="https://ece.eng.rmuti.ac.th/?page_id=100"
              target="_blank"
              rel="noreferrer"
              style={styles.sumrLink}
            >
              รู้จัก SUMR Unit ↗
            </a>
          </article>
          <div style={styles.transportCards}>
            <TransportPoint icon="◎" title="Accessibility" text="พิจารณาความสามารถในการเข้าถึงโอกาสและบริการของประชาชน" />
            <TransportPoint icon="↔" title="Mobility" text="ประเมินประสิทธิภาพการเดินทาง เวลา ความคล่องตัว และความเชื่อมโยง" />
            <TransportPoint icon="△" title="Safety & Risk" text="เปรียบเทียบความเสี่ยง ความปลอดภัย และผลกระทบที่ไม่ควรถูกซ่อนในคะแนนรวม" />
            <TransportPoint icon="♻" title="Sustainability" text="เชื่อมเศรษฐกิจ สังคม สิ่งแวดล้อม และความเป็นธรรมเข้ากับการตัดสินใจเดียวกัน" />
          </div>
        </div>
      </section>

      <section style={styles.sourcesSection}>
        <div style={styles.kicker}>SOURCE NOTES</div>
        <h2 style={{ ...styles.sectionTitle, color: '#f8fafc' }}>เอกสารที่ใช้เรียบเรียงหน้านี้</h2>
        <div style={styles.sourceGrid}>
          <SourceCard
            index="01"
            title="Jitesh J. Thakkar (2021)"
            text="Multi-Criteria Decision Making — โดยเฉพาะ Chapter 1: Historical Milestones in MCDM, ตาราง timeline และการจำแนก MADM/MODM"
          />
          <SourceCard
            index="02"
            title="Cengiz Kahraman (ed.) (2008)"
            text="Fuzzy Multi-Criteria Decision Making: Theory and Applications with Recent Developments — รากของ fuzzy MCDM, Bellman–Zadeh และ intelligent techniques"
          />
          <SourceCard
            index="03"
            title="Watróbski et al. (2019)"
            text="Generalised framework for multi-criteria method selection, Omega 86, 107–124 — ปัญหาการเลือกวิธี, taxonomy 56 methods และ decision-tree framework"
          />
          <SourceCard
            index="04"
            title="SUMR Unit"
            text="ข้อมูลหน่วยวิจัยการขนส่งในเมืองอย่างยั่งยืน สาขาวิชาวิศวกรรมโยธา มทร.อีสาน วิทยาเขตขอนแก่น และตัวอย่างผลงานด้าน MCDA/การขนส่ง"
          />
        </div>
        <p style={styles.sourceNote}>
          หมายเหตุ: แผนภาพในหน้านี้เป็นการวาดใหม่และย่อสาระจากรูป/ตารางในเอกสารแนบเพื่อการอธิบายบนเว็บ ไม่ใช่การทำสำเนาหน้าเอกสารทั้งหน้า
        </p>
      </section>

      <footer style={styles.credit}>
        <div style={styles.creditMark}>SUMR</div>
        <div>
          <div style={styles.creditEyebrow}>END CREDIT</div>
          <h2 style={styles.creditTitle}>Sustainable Urban Mobility Research Unit</h2>
          <p style={styles.creditText}>
            หน่วยวิจัยการขนส่งในเมืองอย่างยั่งยืน (SUMR Unit)<br />
            สาขาวิชาวิศวกรรมโยธา คณะวิศวกรรมศาสตร์<br />
            มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น
          </p>
        </div>
        <button type="button" onClick={onOpenAnalysis} style={styles.creditButton}>
          Continue to MCDA Analysis →
        </button>
      </footer>
    </main>
  );
}

function SectionHeader({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <header style={styles.sectionHeader}>
      <div style={styles.kicker}>{kicker}</div>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <p style={styles.sectionLead}>{text}</p>
    </header>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function FigureCard({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <figure style={styles.figureCard}>
      <div style={styles.figureTitle}>{title}</div>
      <div style={styles.figureCanvas}>{children}</div>
      <figcaption style={styles.figureCaption}>{caption}</figcaption>
    </figure>
  );
}

function HistoryTimelineFigure() {
  const rows = [
    ['1700s', 'Franklin', 'Moral Algebra'],
    ['1951', 'Kuhn & Tucker', 'Nonlinear programming'],
    ['1955', 'Charnes et al.', 'Goal programming'],
    ['1960s', 'Bernard Roy', 'ELECTRE / outranking'],
    ['1970s', 'Saaty', 'AHP'],
    ['1976', 'Keeney & Raiffa', 'Value / utility theory'],
    ['1980s+', 'Multiple schools', 'TOPSIS · PROMETHEE · hybrids'],
  ];
  return (
    <div style={styles.tableFigure}>
      <div style={{ ...styles.tableRow, ...styles.tableHead }}>
        <span style={styles.tableCell}>Era</span><span style={styles.tableCell}>Key contributor</span><span style={styles.tableCell}>Decision idea</span>
      </div>
      {rows.map((row) => (
        <div key={row.join('-')} style={styles.tableRow}>
          <span style={{ ...styles.tableCell, ...styles.tableYear }}>{row[0]}</span>
          <span style={styles.tableCell}>{row[1]}</span>
          <span style={styles.tableCell}>{row[2]}</span>
        </div>
      ))}
    </div>
  );
}

function MethodLandscapeFigure() {
  const nodes = [
    ['SAW', 74, 75], ['AHP', 190, 28], ['TOPSIS', 215, 122], ['ELECTRE', 355, 88],
    ['PROMETHEE', 465, 88], ['VIKOR', 555, 32], ['DEMATEL', 650, 88], ['MOORA', 555, 142],
    ['COPRAS', 670, 155], ['ARAS', 780, 135], ['WASPAS', 885, 130], ['Hybrid', 1010, 88],
  ];
  return (
    <svg viewBox="0 0 1100 210" role="img" aria-label="Simplified MCDM method landscape" style={styles.svgFigure}>
      <defs>
        <linearGradient id="methodBand" x1="0" x2="1">
          <stop offset="0" stopColor="#eaf1fb" />
          <stop offset="1" stopColor="#f4efff" />
        </linearGradient>
      </defs>
      <rect x="20" y="16" width="1060" height="174" rx="28" fill="url(#methodBand)" stroke="#cbd7e8" />
      <text x="58" y="180" fontSize="13" fontWeight="700" fill="#526074">foundational</text>
      <text x="482" y="180" fontSize="13" fontWeight="700" fill="#526074">specialized / recent</text>
      <text x="905" y="180" fontSize="13" fontWeight="700" fill="#526074">integrated</text>
      <path d="M105 82 L205 42 L220 118 L360 88 L465 88 L555 42 L650 88 L555 142 L670 155 L780 135 L885 130 L1010 88" fill="none" stroke="#91a9ca" strokeWidth="2" />
      {nodes.map(([label, x, y]) => (
        <g key={String(label)}>
          <circle cx={Number(x)} cy={Number(y)} r={label === 'Hybrid' ? 35 : 29} fill="#fff" stroke={label === 'ELECTRE' || label === 'PROMETHEE' ? '#6941c6' : '#315a95'} strokeWidth={label === 'ELECTRE' || label === 'PROMETHEE' ? 3 : 2} />
          <text x={Number(x)} y={Number(y) + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#172033">{label}</text>
        </g>
      ))}
      <rect x="327" y="42" width="168" height="90" rx="20" fill="none" stroke="#9d78d1" strokeDasharray="7 6" />
      <text x="411" y="35" textAnchor="middle" fontSize="11" fontWeight="800" fill="#6941c6">OUTRANKING FAMILY</text>
      <rect x="960" y="42" width="98" height="92" rx="20" fill="none" stroke="#2f8a6a" strokeDasharray="7 6" />
    </svg>
  );
}

function FuzzyAiFigure() {
  const nodes = [
    ['Expert\nSystems', 250, 28], ['ANN', 365, 62], ['Genetic\nAlgorithms', 420, 145],
    ['ACO', 365, 226], ['PSO', 250, 258], ['DSS', 135, 226], ['Fuzzy\nSystems', 80, 145], ['Search\nMethods', 135, 62],
  ];
  return (
    <svg viewBox="0 0 500 300" role="img" aria-label="AI techniques around fuzzy MCDM" style={styles.svgFigure}>
      <circle cx="250" cy="145" r="57" fill="#183b70" />
      <text x="250" y="139" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff">INTELLIGENT</text>
      <text x="250" y="158" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff">FMCDM</text>
      {nodes.map(([label, x, y]) => {
        const tx = Number(x); const ty = Number(y);
        const lines = String(label).split('\n');
        return (
          <g key={String(label)}>
            <line x1="250" y1="145" x2={tx} y2={ty} stroke="#9fb0c6" strokeWidth="2" />
            <circle cx={tx} cy={ty} r="38" fill="#fff" stroke="#315a95" strokeWidth="2" />
            {lines.map((line, i) => <text key={line} x={tx} y={ty + (i - (lines.length - 1) / 2) * 14 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#24344e">{line}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

function MethodSelectionFigure() {
  return (
    <svg viewBox="0 0 760 330" role="img" aria-label="MCDA method selection framework" style={styles.svgFigure}>
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#637a99" />
        </marker>
      </defs>
      <rect x="25" y="25" width="710" height="80" rx="18" fill="#f4f7fb" stroke="#b8c7da" />
      <rect x="48" y="43" width="175" height="44" rx="11" fill="#fff" stroke="#8ea3bf" />
      <rect x="292" y="43" width="175" height="44" rx="11" fill="#fff" stroke="#8ea3bf" />
      <rect x="536" y="43" width="175" height="44" rx="11" fill="#dbe5f3" stroke="#8ea3bf" />
      <text x="135" y="70" textAnchor="middle" fontSize="12" fontWeight="800">Set of MCDA methods</text>
      <text x="380" y="62" textAnchor="middle" fontSize="11" fontWeight="800">Analyse method</text>
      <text x="380" y="77" textAnchor="middle" fontSize="11" fontWeight="800">characteristics</text>
      <text x="623" y="62" textAnchor="middle" fontSize="11" fontWeight="800">Capabilities of</text>
      <text x="623" y="77" textAnchor="middle" fontSize="11" fontWeight="800">each method</text>
      <line x1="223" y1="65" x2="286" y2="65" stroke="#637a99" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="467" y1="65" x2="530" y2="65" stroke="#637a99" strokeWidth="2" markerEnd="url(#arrow)" />

      <rect x="25" y="130" width="710" height="80" rx="18" fill="#faf8ff" stroke="#c5b3df" />
      <rect x="48" y="148" width="175" height="44" rx="11" fill="#fff" stroke="#a888cf" />
      <rect x="292" y="148" width="175" height="44" rx="11" fill="#fff" stroke="#a888cf" />
      <rect x="536" y="148" width="175" height="44" rx="11" fill="#eee6f9" stroke="#a888cf" />
      <text x="135" y="166" textAnchor="middle" fontSize="11" fontWeight="800">Rule base for</text>
      <text x="135" y="181" textAnchor="middle" fontSize="11" fontWeight="800">method selection</text>
      <text x="380" y="174" textAnchor="middle" fontSize="11" fontWeight="800">Uncertainty modelling</text>
      <text x="623" y="166" textAnchor="middle" fontSize="11" fontWeight="800">Selection algorithm</text>
      <text x="623" y="181" textAnchor="middle" fontSize="11" fontWeight="800">/ expert system</text>
      <line x1="223" y1="170" x2="286" y2="170" stroke="#7d659c" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="467" y1="170" x2="530" y2="170" stroke="#7d659c" strokeWidth="2" markerEnd="url(#arrow)" />

      <rect x="25" y="235" width="710" height="70" rx="18" fill="#f0faf6" stroke="#9ccab8" />
      <text x="116" y="258" textAnchor="middle" fontSize="10" fontWeight="800" fill="#18794e">DECISION PROBLEM</text>
      <rect x="180" y="250" width="155" height="40" rx="10" fill="#fff" stroke="#71aa91" />
      <rect x="365" y="250" width="155" height="40" rx="10" fill="#fff" stroke="#71aa91" />
      <rect x="550" y="250" width="155" height="40" rx="10" fill="#d9f0e7" stroke="#71aa91" />
      <text x="258" y="275" textAnchor="middle" fontSize="11" fontWeight="800">Problem descriptors</text>
      <text x="442" y="275" textAnchor="middle" fontSize="11" fontWeight="800">Match properties</text>
      <text x="628" y="268" textAnchor="middle" fontSize="11" fontWeight="800">Recommended</text>
      <text x="628" y="282" textAnchor="middle" fontSize="11" fontWeight="800">MCDA methods</text>
      <line x1="335" y1="270" x2="359" y2="270" stroke="#4f8c72" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="520" y1="270" x2="544" y2="270" stroke="#4f8c72" strokeWidth="2" markerEnd="url(#arrow)" />
      <line x1="623" y1="210" x2="623" y2="244" stroke="#7d659c" strokeWidth="2" markerEnd="url(#arrow)" />
    </svg>
  );
}

function FlowNode({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return (
    <div style={{ ...styles.flowNode, ...(highlight ? styles.flowNodeHighlight : {}) }}>{label}</div>
  );
}

function FlowArrow() {
  return <div style={styles.flowArrow}>↓</div>;
}

function TransportPoint({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <article style={styles.transportPoint}>
      <div style={styles.transportIcon}>{icon}</div>
      <div>
        <h4 style={styles.transportPointTitle}>{title}</h4>
        <p style={styles.transportPointText}>{text}</p>
      </div>
    </article>
  );
}

function SourceCard({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <article style={styles.sourceCard}>
      <div style={styles.sourceIndex}>{index}</div>
      <h3 style={styles.sourceTitle}>{title}</h3>
      <p style={styles.sourceText}>{text}</p>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f7f9fc',
    color: '#172033',
    fontFamily: 'Inter, "Noto Sans Thai", "Segoe UI", Arial, sans-serif',
    overflow: 'hidden',
  },
  hero: {
    position: 'relative',
    maxWidth: 1240,
    margin: '0 auto',
    padding: '78px 28px 68px',
    overflow: 'hidden',
  },
  heroGlowA: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(49,90,149,.16), rgba(49,90,149,0) 70%)',
    top: -210,
    right: -80,
    pointerEvents: 'none',
  },
  heroGlowB: {
    position: 'absolute',
    width: 430,
    height: 430,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(105,65,198,.12), rgba(105,65,198,0) 70%)',
    bottom: -220,
    left: -120,
    pointerEvents: 'none',
  },
  heroContent: { position: 'relative', zIndex: 1, maxWidth: 980 },
  eyebrow: { fontSize: 12, fontWeight: 900, letterSpacing: '.18em', color: '#315a95', marginBottom: 16 },
  heroTitle: { margin: 0, fontSize: 'clamp(40px,6vw,76px)', lineHeight: 1.05, letterSpacing: '-.045em', maxWidth: 980 },
  heroLead: { margin: '24px 0 0', maxWidth: 880, fontSize: 18, lineHeight: 1.85, color: '#526074' },
  heroActions: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 30 },
  primaryButton: { border: 0, borderRadius: 12, background: '#183b70', color: '#fff', padding: '13px 19px', fontWeight: 900, fontSize: 14, cursor: 'pointer', boxShadow: '0 12px 28px rgba(24,59,112,.20)' },
  secondaryButton: { border: '1px solid #cdd7e5', borderRadius: 12, background: '#fff', color: '#315a95', padding: '12px 18px', fontWeight: 850, fontSize: 14, textDecoration: 'none' },
  heroStats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12, marginTop: 46, maxWidth: 980 },
  stat: { borderTop: '1px solid #ccd6e4', paddingTop: 14 },
  statValue: { fontSize: 24, fontWeight: 950, color: '#183b70', letterSpacing: '-.025em' },
  statLabel: { marginTop: 3, color: '#667085', fontSize: 12, lineHeight: 1.55 },
  section: { maxWidth: 1240, margin: '0 auto', padding: '70px 28px' },
  historySection: { maxWidth: 1100 },
  sectionHeader: { maxWidth: 900, marginBottom: 32 },
  kicker: { fontSize: 11, fontWeight: 950, letterSpacing: '.16em', color: '#315a95', marginBottom: 9 },
  sectionTitle: { margin: 0, fontSize: 'clamp(30px,4vw,48px)', lineHeight: 1.15, letterSpacing: '-.035em', color: '#172033' },
  sectionLead: { margin: '14px 0 0', fontSize: 16, lineHeight: 1.8, color: '#667085', maxWidth: 850 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 },
  ideaCard: { background: '#fff', border: '1px solid #e0e7ef', borderRadius: 18, padding: 22, boxShadow: '0 10px 28px rgba(31,49,77,.05)' },
  ideaNumber: { width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#edf3fb', color: '#315a95', fontSize: 11, fontWeight: 950 },
  cardTitle: { margin: '16px 0 8px', fontSize: 19, lineHeight: 1.35 },
  cardText: { margin: 0, color: '#5f6b7d', lineHeight: 1.72, fontSize: 14 },
  timeline: { marginTop: 24 },
  timelineRow: { display: 'grid', gridTemplateColumns: '34px minmax(0,1fr)', gap: 16, alignItems: 'stretch' },
  timelineRail: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  timelineDot: { width: 15, height: 15, borderRadius: '50%', marginTop: 22, boxShadow: '0 0 0 5px #f7f9fc', zIndex: 1 },
  timelineLine: { width: 2, flex: 1, minHeight: 70, background: '#d7e0eb', marginTop: 2 },
  timelineCard: { marginBottom: 16, borderRadius: 18, border: '1px solid #e0e7ef', background: '#fff', padding: '20px 22px', boxShadow: '0 8px 24px rgba(31,49,77,.04)' },
  timelineMeta: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  timelineEra: { fontSize: 10, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' },
  timelineYear: { fontSize: 12, fontWeight: 850, color: '#68758a', borderRadius: 999, background: '#f3f5f8', padding: '4px 8px' },
  timelineTitle: { margin: '9px 0 7px', fontSize: 21, lineHeight: 1.35 },
  timelineText: { margin: 0, fontSize: 14, lineHeight: 1.8, color: '#5c687b' },
  visualGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))', gap: 16 },
  figureCard: { margin: 0, background: '#fff', border: '1px solid #dfe7f1', borderRadius: 20, padding: 18, boxShadow: '0 12px 32px rgba(31,49,77,.06)' },
  figureTitle: { fontSize: 16, fontWeight: 900, color: '#22344f', marginBottom: 13 },
  figureCanvas: { minHeight: 250, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#f8fafc,#f0f4f9)', borderRadius: 14, padding: 14, overflow: 'hidden' },
  figureCaption: { marginTop: 12, fontSize: 12, lineHeight: 1.65, color: '#667085' },
  svgFigure: { width: '100%', height: 'auto', maxHeight: 360, overflow: 'visible' },
  tableFigure: { width: '100%', maxWidth: 640, border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  tableRow: { display: 'grid', gridTemplateColumns: '.75fr 1.25fr 1.7fr', borderTop: '1px solid #e3e8ef', fontSize: 11, color: '#435067' },
  tableHead: { borderTop: 0, background: '#eaf1fb', fontWeight: 900, color: '#183b70' },
  tableCell: { padding: '9px 10px', borderRight: '1px solid #e3e8ef' },
  tableYear: { fontWeight: 850, color: '#315a95' },
  splitSection: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 26, alignItems: 'center' },
  splitCopy: { minWidth: 0 },
  bodyText: { margin: '14px 0 0', fontSize: 15, lineHeight: 1.85, color: '#59667a' },
  quotePanel: { borderRadius: 24, padding: '30px 28px', background: 'linear-gradient(145deg,#183b70,#284f86)', color: '#fff', boxShadow: '0 22px 50px rgba(24,59,112,.22)' },
  quoteMark: { fontFamily: 'Georgia, serif', fontSize: 70, lineHeight: .7, opacity: .38 },
  quoteText: { margin: '18px 0 0', fontSize: 20, lineHeight: 1.7 },
  quoteFoot: { marginTop: 18, fontSize: 11, letterSpacing: '.08em', opacity: .68 },
  methodGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 },
  methodCard: { background: '#fff', border: '1px solid #e0e7ef', borderRadius: 18, padding: 20 },
  methodFamily: { fontSize: 10, fontWeight: 950, letterSpacing: '.12em', color: '#6941c6', textTransform: 'uppercase' },
  methodNames: { margin: '8px 0 9px', fontSize: 18, color: '#20334f' },
  fuzzySection: { borderRadius: 30, background: 'linear-gradient(145deg,#eef3fb,#f7f4ff)', border: '1px solid #dce4f1', marginTop: 30, marginBottom: 30 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 30, alignItems: 'center' },
  miniFlow: { background: 'rgba(255,255,255,.75)', border: '1px solid #dbe3ee', borderRadius: 20, padding: 18 },
  flowNode: { border: '1px solid #cad5e4', borderRadius: 12, background: '#fff', color: '#33445e', padding: '11px 13px', textAlign: 'center', fontWeight: 850, fontSize: 12 },
  flowNodeHighlight: { background: '#183b70', borderColor: '#183b70', color: '#fff' },
  flowArrow: { textAlign: 'center', color: '#8799b2', fontWeight: 900, padding: '3px 0' },
  transportGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18 },
  transportMain: { borderRadius: 24, padding: 26, background: '#fff', border: '1px solid #dfe7f1', boxShadow: '0 12px 34px rgba(31,49,77,.05)' },
  transportTitle: { margin: 0, fontSize: 28, color: '#183b70' },
  sumrLink: { display: 'inline-flex', marginTop: 20, color: '#fff', background: '#18794e', textDecoration: 'none', fontWeight: 900, padding: '10px 14px', borderRadius: 10 },
  transportCards: { display: 'grid', gap: 10 },
  transportPoint: { display: 'grid', gridTemplateColumns: '42px 1fr', gap: 12, background: '#fff', border: '1px solid #e0e7ef', borderRadius: 16, padding: 15 },
  transportIcon: { width: 40, height: 40, borderRadius: 12, background: '#eaf7f1', color: '#18794e', display: 'grid', placeItems: 'center', fontWeight: 950 },
  transportPointTitle: { margin: 0, fontSize: 15, color: '#263a55' },
  transportPointText: { margin: '4px 0 0', fontSize: 12, lineHeight: 1.55, color: '#677488' },
  sourcesSection: { background: '#172033', color: '#fff', padding: '64px max(28px,calc((100vw - 1184px)/2))', marginTop: 30 },
  sourceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12, marginTop: 28 },
  sourceCard: { border: '1px solid rgba(255,255,255,.13)', borderRadius: 16, padding: 18, background: 'rgba(255,255,255,.045)' },
  sourceIndex: { fontSize: 10, fontWeight: 950, letterSpacing: '.15em', color: '#9ab9e5' },
  sourceTitle: { margin: '9px 0 7px', fontSize: 16, color: '#fff' },
  sourceText: { margin: 0, color: '#cbd5e1', fontSize: 12, lineHeight: 1.65 },
  sourceNote: { margin: '18px 0 0', color: '#94a3b8', fontSize: 11, lineHeight: 1.6 },
  credit: { maxWidth: 1240, margin: '0 auto', padding: '52px 28px 70px', display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 22, alignItems: 'center' },
  creditMark: { width: 92, height: 92, borderRadius: 26, background: 'linear-gradient(145deg,#183b70,#18794e)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 950, letterSpacing: '.08em', boxShadow: '0 16px 34px rgba(24,59,112,.18)' },
  creditEyebrow: { fontSize: 10, fontWeight: 950, letterSpacing: '.16em', color: '#315a95' },
  creditTitle: { margin: '5px 0 5px', fontSize: 24, color: '#172033' },
  creditText: { margin: 0, color: '#667085', fontSize: 13, lineHeight: 1.65 },
  creditButton: { border: 0, borderRadius: 12, background: '#183b70', color: '#fff', padding: '12px 15px', fontWeight: 900, cursor: 'pointer' },
};
