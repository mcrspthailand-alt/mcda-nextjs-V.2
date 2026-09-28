'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type SiteLanguage = 'th' | 'en';

const LanguageContext = createContext<{ language: SiteLanguage; setLanguage: (language: SiteLanguage) => void }>({
  language: 'th',
  setLanguage: () => undefined,
});

const PAIRS: Array<[string, string]> = [
  ['หน้าหลัก | MCDA Analysis', 'Home | MCDA Analysis'],
  ['หน้าหลัก', 'Home'],
  ['ไทย', 'Thai'],
  ['บันทึกรายงาน PDF (โมเดลที่เลือก)', 'Export PDF report (selected models)'],
  ['ก่อนยุคแบบจำลอง', 'Pre-formal modelling era'],
  ['จาก “การชั่งน้ำหนักด้วยสัญชาตญาณ” สู่ Moral Algebra', 'From intuitive trade-offs to Moral Algebra'],
  ['การตัดสินใจหลายเกณฑ์มีรากจากการชั่งข้อดี–ข้อเสียในชีวิตจริงมาอย่างยาวนาน เอกสารของ Thakkar ยกเรื่องเล่าเกี่ยวกับ King Solomon และต่อมาคือ Benjamin Franklin ซึ่งใช้วิธีแบ่งกระดาษเป็นเหตุผล “เห็นด้วย/ไม่เห็นด้วย” แล้วหักล้างข้อที่มีน้ำหนักใกล้เคียงกัน วิธีนี้ถูกเรียกว่า Moral Algebra และสะท้อนแนวคิดพื้นฐานของการเปรียบเทียบ trade-off ก่อนที่จะมีสมการ MCDA อย่างเป็นทางการ', 'Multi-criteria decision making has long relied on explicit trade-offs among competing considerations. Thakkar traces this development from the story of King Solomon to Benjamin Franklin’s Moral Algebra, in which arguments for and against a decision were compared and offset. This early logic anticipated formal MCDA by making trade-offs explicit before mathematical models were available.'],
  ['Condorcet และ Borda: การรวมความชอบของหลายคน', 'Condorcet and Borda: Aggregating group preferences'],
  ['ปัญหาการลงคะแนนทำให้เกิดคำถามสำคัญว่า เมื่อแต่ละคนมีลำดับความชอบของตนเอง เราจะรวมความชอบเหล่านั้นเป็นผลของกลุ่มอย่างไร Condorcet เน้นการเปรียบเทียบแบบตัวต่อตัว ขณะที่ Borda ใช้คะแนนตามอันดับ แนวคิดเหล่านี้เป็นบรรพบุรุษของการจัดอันดับและความสัมพันธ์แบบ outranking ในเวลาต่อมา', 'Voting theory introduced a central problem in collective decision making: how individual preference orders can be aggregated into a group outcome. Condorcet emphasized pairwise comparison, whereas Borda used rank-based scoring. These ideas later informed formal ranking and outranking approaches.'],
  ['Edgeworth และ Pareto: จุดเริ่มต้นเชิงคณิตศาสตร์', 'Edgeworth and Pareto: Mathematical foundations'],
  ['งานด้านเศรษฐศาสตร์สวัสดิการของ Francis Edgeworth และ Vilfredo Pareto วางรากฐานให้การพิจารณาหลายเป้าหมายอย่างเป็นระบบ ทั้ง indifference curve, Edgeworth box และ Pareto optimality ซึ่งถามว่าเราจะปรับปรุงทางเลือกหนึ่งได้หรือไม่โดยไม่ทำให้อีกมิติหนึ่งแย่ลง แนวคิด “ไม่มีทางเลือกใดครอบงำได้ทั้งหมด” กลายเป็นแกนสำคัญของ multi-objective decision making', 'The welfare-economics work of Francis Edgeworth and Vilfredo Pareto established a mathematical basis for multiple objectives through concepts such as indifference curves, the Edgeworth box, and Pareto optimality. Pareto reasoning asks whether one dimension can be improved without worsening another, a principle that remains fundamental to multi-objective decision making.'],
  ['Optimization และ Goal Programming', 'Optimization and Goal Programming'],
  ['Kuhn–Tucker conditions ช่วยวางพื้นฐานให้ nonlinear optimization และการวิเคราะห์หลายวัตถุประสงค์ ขณะที่ Charnes, Cooper และ Ferguson พัฒนา Goal Programming เพื่อหาคำตอบที่ “น่าพอใจ” เมื่อมีหลายเป้าหมายที่ขัดแย้งกัน แทนที่จะคาดหวังคำตอบเดียวที่ดีที่สุดในทุกมิติพร้อมกัน', 'Kuhn–Tucker conditions strengthened the foundations of nonlinear optimization and multiple-objective analysis. Goal Programming, developed by Charnes, Cooper, and Ferguson, shifted attention toward satisfactory solutions when objectives conflict rather than assuming that one alternative can be optimal on every dimension.'],
  ['Bernard Roy และ ELECTRE: กำเนิด outranking', 'Bernard Roy and ELECTRE: The emergence of outranking'],
  ['ELECTRE เปลี่ยนมุมมองจากการรวมทุกอย่างให้เป็นคะแนนเดียว ไปสู่คำถามว่า “มีหลักฐานเพียงพอหรือไม่ที่จะกล่าวว่า A ดีกว่า B” พร้อมยอมรับความไม่เปรียบเทียบกันของบางทางเลือก แนวคิดนี้กลายเป็นรากของ European school และต่อยอดไปสู่กลุ่ม outranking เช่น PROMETHEE', 'ELECTRE reframed decision analysis from a single aggregate score to the question of whether sufficient evidence supports the statement that one alternative outranks another. It also permits incomparability, a defining idea of the European school that later influenced methods such as PROMETHEE.'],
  ['Zadeh, Bellman และการตัดสินใจภายใต้ความคลุมเครือ', 'Zadeh, Bellman, and decision making under imprecision'],
  ['Zadeh เสนอ fuzzy sets ในปี 1965 และ Bellman–Zadeh นำแนวคิด fuzzy goals กับ fuzzy constraints เข้าสู่การตัดสินใจในปี 1970 ทำให้ข้อมูลเชิงภาษา ความคลุมเครือ และความไม่แน่นอนของมนุษย์สามารถเข้าสู่แบบจำลองได้ ต่อมางานของ Baas–Kwakernaak, Yager และนักวิจัยจำนวนมากผลักดัน fuzzy MCDM ให้เติบโตอย่างรวดเร็ว', 'Zadeh introduced fuzzy sets in 1965, and Bellman and Zadeh extended fuzzy goals and constraints to decision making in 1970. Their work enabled linguistic assessments, imprecision, and human uncertainty to be represented explicitly and stimulated the subsequent development of fuzzy MCDM.'],
  ['AHP, Utility/Value Theory และ TOPSIS', 'AHP, Utility/Value Theory, and TOPSIS'],
  ['Thomas Saaty ทำให้การเปรียบเทียบเป็นคู่และลำดับชั้นเป็นเครื่องมือที่ผู้ใช้เข้าใจง่ายผ่าน AHP; Keeney–Raiffa พัฒนาสาย multi-attribute value/utility; และ Hwang–Yoon ทำให้แนวคิด “ใกล้จุดอุดมคติ–ไกลจุดเลวร้าย” เป็นที่รู้จักผ่าน TOPSIS วิธีเหล่านี้ช่วยเชื่อมระหว่างข้อมูลเชิงปริมาณกับ judgment ของผู้ตัดสินใจ', 'Thomas Saaty formalized pairwise comparison and hierarchical modelling through AHP; Keeney and Raiffa advanced multi-attribute value and utility theory; and Hwang and Yoon popularized the ideal–anti-ideal logic of TOPSIS. Together, these approaches linked quantitative evidence with explicit decision-maker judgement.'],
  ['จากหนึ่งวิธี สู่ครอบครัวของวิธี', 'From individual methods to method families'],
  ['เมื่อโจทย์จริงซับซ้อนขึ้น มีทั้ง VIKOR, ANP, DEMATEL, MOORA, COPRAS, ARAS, WASPAS, SWARA, fuzzy extensions และ hybrid methods จำนวนมาก ความก้าวหน้าทำให้ MCDA ทรงพลังขึ้น แต่ก็สร้าง “meta-decision problem” ใหม่ คือ จะเลือกวิธีใดให้เหมาะกับลักษณะของปัญหา', 'As decision problems became more complex, methods such as VIKOR, ANP, DEMATEL, MOORA, COPRAS, ARAS, WASPAS, and SWARA were joined by fuzzy extensions and hybrid models. This growth increased analytical flexibility but also created a new meta-decision problem: selecting a method whose assumptions fit the problem.'],
  ['MCDA กลายเป็นระบบสนับสนุนการตัดสินใจ', 'MCDA as decision support'],
  ['งานของ Watróbski และคณะวิเคราะห์ 56 วิธีและสร้างกรอบคัดเลือกวิธีจากคุณลักษณะของโจทย์ เช่น ชนิดน้ำหนัก สเกลข้อมูล ความไม่แน่นอน และรูปแบบผลลัพธ์ งานยุคใหม่จึงไม่เพียง “คำนวณอันดับ” แต่ยังให้ความสำคัญกับ sensitivity, robustness, uncertainty และการเลือกวิธีให้สอดคล้องกับโจทย์จริง', 'Watróbski and colleagues analysed 56 methods and proposed a selection framework based on characteristics such as weight specification, data scale, uncertainty, and required output. Contemporary MCDA therefore extends beyond ranking to include sensitivity, robustness, uncertainty, and explicit method–problem fit.'],
  ['หลายเกณฑ์มักขัดแย้งกัน', 'Criteria are often conflicting'],
  ['ต้นทุนต่ำอาจสวนทางกับคุณภาพสูง ความเร็วอาจสวนทางกับความปลอดภัย ประสิทธิภาพอาจสวนทางกับผลกระทบสิ่งแวดล้อม MCDA มีหน้าที่ทำให้ trade-off เหล่านี้มองเห็นและตรวจสอบได้', 'Lower cost may conflict with higher quality, speed with safety, and efficiency with environmental performance. MCDA makes these trade-offs explicit, structured, and open to examination.'],
  ['ไม่มี “วิธีเดียวที่ดีที่สุด” สำหรับทุกปัญหา', 'No single method is best for every problem'],
  ['วิธีต่างกันใช้ตรรกะต่างกัน ทั้งการชดเชย (compensatory), ระยะห่างจาก ideal solution, outranking, utility/value, pairwise comparison และ causal structure จึงให้ผลต่างกันได้แม้ใช้ข้อมูลชุดเดียวกัน', 'Different methods encode different decision logics, including compensation, distance from an ideal solution, outranking, utility or value aggregation, pairwise comparison, and causal structure. The same data can therefore produce different rankings under different methods.'],
  ['ความชอบของมนุษย์เป็นส่วนหนึ่งของแบบจำลอง', 'Human preferences are part of the model'],
  ['น้ำหนัก เกณฑ์ threshold ลำดับความสำคัญ และความยอมรับความเสี่ยง ล้วนสะท้อน preference structure ของผู้ตัดสินใจ เป้าหมายไม่ใช่แทนที่มนุษย์ แต่ทำให้เหตุผลเบื้องหลังการตัดสินใจโปร่งใสขึ้น', 'Weights, thresholds, priorities, and risk attitudes all express the decision maker’s preference structure. The objective is not to replace judgement but to make the reasoning behind a decision more transparent.'],
  ['ความไม่แน่นอนต้องถูกจัดการอย่างเป็นระบบ', 'Uncertainty requires explicit treatment'],
  ['โลกจริงมีข้อมูลไม่ครบ คำอธิบายเชิงภาษา และ judgment ที่ไม่แม่นยำ จึงเกิด fuzzy MCDM, grey systems, stochastic approaches และ sensitivity analysis เพื่อดูว่าคำตอบเสถียรเพียงใดเมื่อสมมติฐานเปลี่ยน', 'Real decisions often involve incomplete data, linguistic assessments, and imprecise judgement. Fuzzy MCDM, grey systems, stochastic approaches, and sensitivity analysis provide systematic ways to examine how stable conclusions remain when assumptions change.'],
  ['รวมผลการประเมินด้วย value/utility หรือ weighted aggregation', 'Aggregate performance through value, utility, or weighted scoring.'],
  ['วัดความใกล้–ไกลจาก solution ที่ต้องการ หรือสร้าง compromise solution', 'Measure proximity to a preferred solution or derive a compromise solution.'],
  ['เปรียบเทียบทางเลือกเป็นคู่ และยอมรับกรณีที่บางทางเลือก “เปรียบเทียบกันไม่ได้”', 'Compare alternatives pairwise while allowing incomparability where appropriate.'],
  ['แทนความคลุมเครือและข้อมูลไม่สมบูรณ์ด้วย fuzzy/grey representation', 'Represent imprecision and incomplete information with fuzzy or grey models.'],
  ['ใช้เมื่อตัวแปรมีความสัมพันธ์หรืออิทธิพลต่อกัน ไม่ได้เป็นเพียงรายการเกณฑ์อิสระ', 'Use when criteria or variables interact rather than behave as independent factors.'],
  ['ผสานหลายวิธีหรือใช้ระบบผู้เชี่ยวชาญ/AI เพื่อรองรับปัญหาซับซ้อนและการตัดสินใจแบบโต้ตอบ', 'Combine methods or intelligent systems to support complex and interactive decision processes.'],
  ['จาก “การชั่งใจ” ของมนุษย์', 'From human trade-offs'],
  ['สู่ศาสตร์การตัดสินใจหลายเกณฑ์', 'to Multi-Criteria Decision Analysis'],
  ['คือกรอบคิดสำหรับปัญหาที่ไม่มีคำตอบดีที่สุดเพียงมิติเดียว แต่ต้องพิจารณาหลายเกณฑ์ หลายความเห็น', 'provides a structured framework for problems that cannot be resolved by a single criterion and must account for multiple criteria, perspectives,'],
  ['และหลายข้อจำกัดพร้อมกัน หน้านี้สรุปพัฒนาการสำคัญจากเอกสารอ้างอิง 3 ชุดที่แนบมา', 'and constraints simultaneously. This page synthesizes the main developments presented in the three reference sources,'],
  ['ตั้งแต่รากฐานด้านเศรษฐศาสตร์และ Operations Research ไปจนถึง fuzzy decision,', 'from foundations in welfare economics and Operations Research to fuzzy decision models,'],
  ['outranking, hybrid methods และระบบสนับสนุนการตัดสินใจสมัยใหม่', 'outranking, hybrid methods, and modern decision-support systems.'],
  ['เปิด MCDA Analysis', 'Open MCDA Analysis'],
  ['ดูเส้นเวลาประวัติศาสตร์', 'View historical timeline'],
  ['หลายศตวรรษ', 'Several centuries'],
  ['จาก intuitive trade-off สู่ formal decision science', 'From intuitive trade-offs to formal decision science'],
  ['ถูกจัดหมวดในกรอบคัดเลือกของ Watróbski et al.', 'Classified within the Watróbski et al. method-selection framework'],
  ['สองสายหลักของการตัดสินใจหลายเกณฑ์', 'Two major branches of multi-criteria decision making'],
  ['ทำไมศาสตร์นี้จึงสำคัญ', 'Why MCDA matters'],
  ['ปัญหาจริงแทบไม่เคยมีเกณฑ์เดียว การตัดสินใจที่ดีจึงต้องอธิบายให้ได้ว่าเราเลือกอะไร ให้ความสำคัญกับอะไร และผลลัพธ์เปลี่ยนหรือไม่เมื่อสมมติฐานเปลี่ยน', 'Real decision problems rarely depend on a single criterion. Sound analysis should state what is being selected, which criteria matter, and whether the conclusion changes when assumptions change.'],
  ['ภาพแนวคิดสำคัญจากเอกสารอ้างอิง', 'Key conceptual figures from the references'],
  ['แผนภาพด้านล่างวาดใหม่จากตารางและรูปใน PDF ที่แนบมา เพื่อให้เหมาะกับการอ่านบนเว็บและยังคงสาระของภาพต้นฉบับ', 'The diagrams below are redrawn from the attached references for clear web presentation while preserving their analytical meaning.'],
  ['จากการ “หาคำตอบ” สู่การ “อธิบายเหตุผลของคำตอบ”', 'From finding an answer to explaining the reasoning'],
  ['แนวคิดสรุปจากเอกสารทั้งสามชุด', 'Synthesis of the three reference sources'],
  ['พัฒนาการของ MCDA สะท้อนผ่านครอบครัวของวิธี', 'MCDA development through method families'],
  ['แทนที่จะจำสูตรแยกเป็นรายวิธี การมองเป็นครอบครัวช่วยให้เข้าใจว่าแต่ละเทคนิคตอบคำถามคนละแบบ และเหตุใดจึงควรเปรียบเทียบผลหลายวิธีในปัญหาสำคัญ', 'Viewing MCDA as method families clarifies that each technique answers a different analytical question and explains why important decisions may benefit from cross-method comparison.'],
  ['เมื่อโลกจริงไม่ “crisp” — Fuzzy, Grey, AI และ Sensitivity จึงเข้ามา', 'When real-world data are not crisp: Fuzzy, Grey, AI, and sensitivity analysis'],
  ['เข้าสู่ระบบ', 'Sign in'],
  ['ลงทะเบียน', 'Create account'],
  ['ยืนยันอีเมล', 'Verify email'],
  ['อีเมล', 'Email'],
  ['รหัสผ่าน', 'Password'],
  ['ยืนยันรหัสผ่าน', 'Confirm password'],
  ['ชื่อ - นามสกุล', 'Full name'],
  ['หรือ', 'or'],
  ['เข้าสู่ระบบด้วย Google', 'Continue with Google'],
  ['ลงทะเบียนด้วย Google', 'Register with Google'],
  ['ยังไม่มีบัญชี?', 'New to MCDA?'],
  ['มีบัญชีแล้ว?', 'Already have an account?'],
  ['เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน หรือใช้บัญชี Google', 'Use your email and password, or continue with Google.'],
  ['ลงทะเบียนด้วยอีเมลและ OTP หรือใช้บัญชี Google', 'Create an account with email verification or Google.'],
  ['รหัส OTP', 'Verification code'],
  ['ส่ง OTP เพื่อลงทะเบียน', 'Send verification code'],
  ['ยืนยันและสร้างบัญชี', 'Verify and create account'],
  ['แก้ไขข้อมูล / ส่ง OTP ใหม่', 'Edit details / send a new code'],
  ['กำลังเข้าสู่ระบบ…', 'Signing in…'],
  ['กำลังส่ง OTP…', 'Sending code…'],
  ['กำลังยืนยัน…', 'Verifying…'],
  ['ส่ง OTP ไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย', 'A verification code has been sent to your email.'],
  ['รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'The passwords do not match.'],
  ['ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'Unable to connect to the server.'],
  ['เข้าสู่ระบบไม่สำเร็จ', 'Sign-in failed.'],
  ['ออกจากระบบ', 'Sign out'],
  ['แพ็กเกจ', 'Plan'],
  ['อัปเกรด', 'Upgrade'],
  ['ไม่จำกัด', 'Unlimited'],
  ['วันนี้', 'Today'],
  ['เหลือ', 'remaining'],
  ['ภาพรวม', 'Overview'],
  ['ผู้ลงทะเบียน', 'Registered users'],
  ['การใช้งานเว็บ', 'Web activity'],
  ['การวิเคราะห์', 'Analyses'],
  ['การชำระเงิน', 'Payments'],
  ['สิทธิ์สมาชิก', 'Membership'],
  ['รอยืนยัน OTP', 'Pending verification'],
  ['จำนวนผู้ใช้งาน', 'Total users'],
  ['ผู้สมัครผ่าน Premium Page', 'Registrations from Premium page'],
  ['Page views เฉลี่ย / วัน', 'Average page views / day'],
  ['ผู้ลงทะเบียนล่าสุด', 'Latest registrations'],
  ['ดูทั้งหมด', 'View all'],
  ['ดูรายละเอียด', 'View details'],
  ['รายละเอียด', 'Details'],
  ['ข้อมูลผู้ใช้', 'User details'],
  ['ข้อมูลรายการ', 'Record details'],
  ['ค้นหา', 'Search'],
  ['ค้นหาชื่อ / อีเมล / รหัสผู้ใช้', 'Search by name, email, or user ID'],
  ['พิมพ์คำค้นหา…', 'Enter a search term…'],
  ['กลุ่มผู้ใช้', 'User cohort'],
  ['ทั้งหมด', 'All'],
  ['สถานะ', 'Status'],
  ['ล้างตัวกรอง', 'Clear filters'],
  ['รีเฟรช', 'Refresh'],
  ['ลองใหม่', 'Retry'],
  ['เริ่มต้น', 'Start'],
  ['สิ้นสุด', 'End'],
  ['ใช้ช่วงวันที่', 'Apply date range'],
  ['เลือกช่วงวันที่', 'Select date range'],
  ['วันเริ่มต้น', 'Start date'],
  ['วันสิ้นสุด', 'End date'],
  ['วัน', 'days'],
  ['รายการ', 'records'],
  ['รายการทั้งหมด', 'All records'],
  ['ล่าสุดก่อน', 'Newest first'],
  ['เก่าสุดก่อน', 'Oldest first'],
  ['ก่อนหน้า', 'Previous'],
  ['ถัดไป', 'Next'],
  ['หน้า', 'Page'],
  ['ส่งออก CSV', 'Export CSV'],
  ['กำลังส่งออก…', 'Exporting…'],
  ['กำลังโหลดข้อมูลจากฐานข้อมูล…', 'Loading data from the database…'],
  ['ไม่พบรายการในช่วงวันที่หรือตัวกรองนี้', 'No records match the selected dates or filters.'],
  ['ข้อมูลจริงจากระบบ', 'Live system data'],
  ['กำลังเชื่อมต่อข้อมูล', 'Connecting to data…'],
  ['ความครอบคลุมของข้อมูล', 'Data coverage'],
  ['ผู้ลงทะเบียนล่าสุด', 'Latest registrations'],
  ['ชำระสำเร็จ', 'Paid'],
  ['สมัครใหม่', 'New registrations'],
  ['ขอวิเคราะห์', 'Analysis requests'],
  ['ดูข้อมูลกราฟแบบตาราง', 'View chart data as a table'],
  ['นิยามตัวเลขและข้อจำกัดของรายงาน', 'Metric definitions and reporting limitations'],
  ['จำนวนผู้ใช้ทั้งหมดและแพ็กเกจเป็นสถานะปัจจุบัน ส่วนผู้สมัครใหม่ใช้วันสมัครจริง Active users นับคนไม่ซ้ำตลอดช่วงเวลา จึงไม่ใช่ผลรวมรายวัน Page views เป็นเหตุการณ์ที่เบราว์เซอร์ส่งสำเร็จ อาจน้อยกว่าการเข้าชมจริงเมื่อปิดการติดตาม', 'Total users and plan status reflect the current state. New registrations use the actual registration date. Active users are deduplicated across the selected period and are not a sum of daily counts. Page views are client-side events and may undercount visits when tracking is blocked.'],
  ['Premium Page หมายถึงผู้ที่เข้าหน้า /billing ขณะยังไม่เข้าสู่ระบบ แล้วสมัครบัญชีใหม่ในเบราว์เซอร์เดียวกันภายใน 30 นาที แหล่งสมัครที่ไม่เคยบันทึกแสดงเป็น “ไม่ทราบ” ไม่อนุมานจากรายการชำระเงิน', 'Premium Page attribution identifies users who visited /billing while signed out and created an account in the same browser within 30 minutes. Unrecorded acquisition sources remain unknown and are not inferred from payment records.'],
  ['การวิเคราะห์นับคำขอ Generate ที่ได้รับอนุมัติจากระบบโควตา กราฟโมเดลนับแยกโมเดลที่เลือกในคำขอเดียวกันได้ จึงรวมแล้วอาจมากกว่าจำนวน Generate รายรับรวมเฉพาะ THB และคำสั่ง paid ตามวันที่ paid_at ไม่ใช่ยอดสุทธิหลังคืนเงิน', 'Analysis counts represent Generate requests authorized by the quota service. Model charts count selected models separately, so their sum may exceed Generate requests. Revenue includes paid THB orders by paid_at and does not represent net revenue after refunds.'],
  ['ไม่พบรายการชำระเงินนี้ กรุณาสร้างรายการชำระเงินใหม่', 'This payment record was not found. Please create a new payment request.'],
  ['รายการชำระเงินนี้หมดอายุหรือถูกยกเลิกแล้ว กรุณาสร้างรายการชำระเงินใหม่', 'This payment request has expired or was cancelled. Please create a new one.'],
  ['ไฟล์สลิปไม่ถูกต้อง กรุณาใช้ไฟล์ JPEG, PNG, GIF หรือ WebP ขนาดไม่เกิน 4 MB', 'The payment slip is invalid. Use a JPEG, PNG, GIF, or WebP file no larger than 4 MB.'],
  ['ไม่สามารถยืนยันสลิปนี้ได้ กรุณาตรวจสอบว่าสลิปถูกต้องและลองอีกครั้ง', 'The payment slip could not be verified. Check the file and try again.'],
  ['ตรวจสอบสลิปไม่สำเร็จ กรุณาลองอีกครั้ง', 'Slip verification failed. Please try again.'],
  ['ชำระเงินสำเร็จ เปิดใช้งาน Premium แล้ว', 'Payment confirmed. Premium access is active.'],
  ['โหลดข้อมูลไม่สำเร็จ', 'Unable to load data.'],
  ['สร้างรายการไม่สำเร็จ', 'Unable to create the payment request.'],
  ['กำลังเริ่มรายการชำระเงินใหม่…', 'Starting a new payment request…'],
  ['ชำระผ่าน AMS Hosted Checkout', 'Pay via AMS Hosted Checkout'],
  ['ไปหน้าชำระเงิน Card / PromptPay', 'Continue to Card / PromptPay'],
  ['ตรวจสอบสลิปไม่ผ่าน', 'Slip verification failed'],
  ['ตรวจสอบสลิปสำเร็จ', 'Slip verified'],
  ['กำลังตรวจสอบสลิป…', 'Verifying slip…'],
  ['ตรวจสอบสลิปและเปิด Premium', 'Verify slip and activate Premium'],
  ['เบอร์มือถือ', 'Mobile number'],
  ['เลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี', 'National ID / Tax ID'],
  ['ปลดล็อก MCDA ทั้ง 13 โมเดล', 'Unlock all 13 MCDA models'],
  ['ไม่จำกัดจำนวนการวิเคราะห์ต่อวัน', 'Unlimited analyses per day'],
  ['ใช้งาน Ranking, Sensitivity, Narrative, CSV และ PDF ตามโมเดลที่เลือกได้เต็มรูปแบบ', 'Full access to ranking, sensitivity analysis, narrative output, CSV, and PDF for selected models'],
  ['โมเดลนี้เป็น Premium', 'This model requires Premium access'],
  ['ไม่สามารถตรวจสอบสิทธิ์สมาชิกได้ กรุณารีเฟรชหน้าเว็บ', 'Unable to verify membership access. Please refresh the page.'],
  ['ไม่สามารถอนุญาตการวิเคราะห์ได้', 'Analysis authorization failed.'],
  ['ไม่สามารถตรวจสอบโควตาการวิเคราะห์ได้ กรุณาลองใหม่', 'Unable to verify the analysis quota. Please try again.'],
];

function translateText(input: string) {
  let output = input;
  for (const [th, en] of PAIRS) output = output.split(th).join(en);
  return output;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SiteLanguage>('th');
  const textOriginals = useRef(new WeakMap<Node, string>());
  const attrOriginals = useRef(new WeakMap<Element, Map<string, string>>());

  const setLanguage = (next: SiteLanguage) => {
    setLanguageState(next);
    try { localStorage.setItem('mcda-language', next); } catch {}
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mcda-language');
      if (saved === 'th' || saved === 'en') setLanguageState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    const attributes = ['placeholder', 'title', 'aria-label'];

    const apply = (root: ParentNode) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        const value = node.nodeValue || '';
        if (language === 'en') {
          if (/[฀-๿]/.test(value) && !textOriginals.current.has(node)) textOriginals.current.set(node, value);
          const original = textOriginals.current.get(node) || value;
          const translated = translateText(original);
          if (translated !== value) node.nodeValue = translated;
        } else {
          const original = textOriginals.current.get(node);
          if (original !== undefined && node.nodeValue !== original) node.nodeValue = original;
        }
        node = walker.nextNode();
      }

      const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'));
      for (const element of elements) {
        for (const attr of attributes) {
          const value = element.getAttribute(attr);
          if (!value) continue;
          let map = attrOriginals.current.get(element);
          if (!map) { map = new Map(); attrOriginals.current.set(element, map); }
          if (language === 'en') {
            if (/[฀-๿]/.test(value) && !map.has(attr)) map.set(attr, value);
            const original = map.get(attr) || value;
            const translated = translateText(original);
            if (translated !== value) element.setAttribute(attr, translated);
          } else {
            const original = map.get(attr);
            if (original !== undefined && value !== original) element.setAttribute(attr, original);
          }
        }
      }
    };

    apply(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      if (language !== 'en') return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.parentNode) apply(mutation.target.parentNode as ParentNode);
        for (const added of Array.from(mutation.addedNodes)) {
          if (added.nodeType === Node.ELEMENT_NODE) apply(added as Element);
          else if (added.parentNode) apply(added.parentNode as ParentNode);
        }
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
      <label
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 100000,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', border: '1px solid rgba(148,163,184,.45)',
          borderRadius: 10, background: 'rgba(255,255,255,.97)',
          boxShadow: '0 8px 24px rgba(15,23,42,.10)', backdropFilter: 'blur(10px)',
          fontFamily: 'Inter, Arial, "Noto Sans Thai", sans-serif', fontSize: 11, fontWeight: 800,
        }}
        aria-label="Language selector"
      >
        <span aria-hidden="true">🌐</span>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as SiteLanguage)}
          aria-label="Select language"
          style={{ border: 0, background: 'transparent', font: 'inherit', cursor: 'pointer', outline: 'none' }}
        >
          <option value="th">ไทย</option>
          <option value="en">English</option>
        </select>
      </label>
    </LanguageContext.Provider>
  );
}
