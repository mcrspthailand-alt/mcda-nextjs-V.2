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
  ['เส้นเวลานี้เรียบเรียงจากบท Historical Milestones in MCDM, บท Historical Background of Fuzzy MCDM และบทความว่าด้วยการเลือกวิธี MCDA เพื่อให้เห็นว่าศาสตร์นี้พัฒนาจากการชั่งข้อดี–ข้อเสีย สู่การสร้างแบบจำลอง preference, optimization, uncertainty และ decision support systems อย่างไร', 'This timeline synthesizes the Historical Milestones in MCDM, the Historical Background of Fuzzy MCDM, and the MCDA method-selection literature to show the transition from qualitative trade-offs to formal preference modelling, optimization, uncertainty analysis, and decision-support systems.'],
  ['เรียบเรียงใหม่จาก Thakkar (2021), Table 1.6 — แสดงการเปลี่ยนผ่านจาก Moral Algebra, optimization และ goal programming ไปสู่ ELECTRE, interactive methods, AHP/ANP และ behavioural decision theory', 'Redrawn from Thakkar (2021), Table 1.6, showing the transition from Moral Algebra, optimization, and Goal Programming to ELECTRE, interactive methods, AHP/ANP, and behavioural decision theory.'],
  ['เรียบเรียงใหม่จาก Thakkar (2021), Fig. 1.10 — วิธีสมัยใหม่ไม่ได้แยกขาดจากกัน แต่พัฒนาและผสานแนวคิดจากหลายครอบครัว เช่น outranking, cause-effect และ hybrid methods', 'Redrawn from Thakkar (2021), Fig. 1.10. Modern methods are interconnected and combine ideas from multiple families, including outranking, cause–effect modelling, and hybrid approaches.'],
  ['เรียบเรียงใหม่จาก Kahraman (2008), บท Intelligent Fuzzy MCDM — เมื่อข้อมูลและ preference มีความคลุมเครือ งานวิจัยจึงเชื่อม fuzzy MCDM เข้ากับ expert systems, neural networks, search methods และ AI', 'Redrawn from Kahraman (2008), Intelligent Fuzzy MCDM. When data and preferences are imprecise, fuzzy MCDM can be integrated with expert systems, neural networks, search methods, and AI.'],
  ['เรียบเรียงใหม่จาก Watróbski et al. (2019), Fig. 1–2 — การเลือกวิธีกลายเป็นปัญหาการตัดสินใจอีกชั้นหนึ่ง โดยพิจารณาชนิดน้ำหนัก สเกลข้อมูล ความไม่แน่นอน และรูปแบบผลลัพธ์ที่ต้องการ', 'Redrawn from Watróbski et al. (2019), Figs. 1–2. Method selection becomes a decision problem in its own right, based on weight specification, data scale, uncertainty, and the required form of the result.'],
  ['เอกสารของ Thakkar แบ่งปัญหา multi-criteria ออกเป็นสองสายใหญ่:', 'Thakkar distinguishes two major classes of multi-criteria problems:'],
  ['สำหรับทางเลือกที่มีจำนวนจำกัดและกำหนดไว้แล้ว', 'for a finite, predefined set of alternatives'],
  ['ในทางปฏิบัติคำว่า MCDM และ MCDA มักใช้ทับซ้อนกัน แต่คำว่า “analysis” ช่วยย้ำว่ากระบวนการไม่ได้จบที่สูตรคำนวณ', 'In practice, MCDM and MCDA are often used interchangeably. The term “analysis” emphasizes that the process extends beyond a computational formula.'],
  ['หากรวมถึงการกำหนดโจทย์ เลือกเกณฑ์ สร้าง preference structure ตรวจสอบความสอดคล้อง วิเคราะห์ sensitivity', 'It also includes problem formulation, criteria selection, preference modelling, consistency assessment, and sensitivity analysis,'],
  ['และตีความผลเพื่อสร้างข้อเสนอแนะที่นำไปใช้ได้จริง', 'followed by interpretation that supports defensible recommendations.'],
  ['ประเด็นนี้สำคัญมาก เพราะ Watróbski และคณะชี้ว่า MCDA methods จำนวนมากสามารถให้ ranking ที่ต่างกันเมื่อใช้กับข้อมูลเดียวกัน', 'This distinction matters because Watróbski and colleagues show that different MCDA methods may produce different rankings from the same data.'],
  ['ความแตกต่างเกิดจากวิธีจัดการน้ำหนัก การ normalize การชดเชยระหว่างเกณฑ์ การนิยาม ideal/anti-ideal', 'Differences arise from weighting, normalization, compensation rules, ideal and anti-ideal definitions,'],
  ['ทางเลือกหนึ่งจึงเหมาะกว่าอีกทางเลือกหนึ่ง ภายใต้เกณฑ์ ความชอบ', 'why one alternative is preferred to another under stated criteria and preferences,'],
  ['และข้อจำกัดที่ประกาศไว้อย่างชัดเจน', 'and under explicitly stated constraints.'],
  ['จากประวัติศาสตร์ของศาสตร์ สู่การตัดสินใจด้านเมืองและการขนส่ง', 'From the history of MCDA to urban and transport decisions'],
  ['งานด้านการขนส่งเป็นตัวอย่างคลาสสิกของปัญหา multi-criteria เพราะต้องพิจารณาเวลาเดินทาง ต้นทุน ความปลอดภัย สิ่งแวดล้อม การเข้าถึง ความเท่าเทียม และผลกระทบต่อชุมชนพร้อมกัน', 'Transport planning is a canonical multi-criteria problem because travel time, cost, safety, environmental impact, accessibility, equity, and community effects must be considered simultaneously.'],
  ['หน่วยวิจัยการขนส่งในเมืองอย่างยั่งยืน (Sustainable Urban Mobility Research Unit: SUMR Unit)', 'Sustainable Urban Mobility Research Unit (SUMR Unit)'],
  ['สังกัดสาขาวิชาวิศวกรรมโยธา คณะวิศวกรรมศาสตร์ มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น', 'Department of Civil Engineering, Faculty of Engineering, Rajamangala University of Technology Isan, Khon Kaen Campus'],
  ['จัดตั้งขึ้นเพื่อพัฒนางานวิจัย นวัตกรรม และบริการวิชาการด้านการขนส่งและการพัฒนาเมือง โดยบริบทของขอนแก่นมีความสำคัญในฐานะศูนย์กลางเศรษฐกิจ', 'The unit advances research, innovation, and academic services in transport and urban development, with Khon Kaen providing an important regional context.'],
  ['เว็บไซต์ของหน่วยวิจัยยังแสดงผลงานที่ประยุกต์ multi-criteria decision making กับการจัดลำดับความสำคัญของทางแยก', 'The unit also reports applications of multi-criteria decision making to intersection prioritization'],
  ['และการประเมินระบบขนส่งเมืองอย่างยั่งยืน ซึ่งสะท้อนบทบาทของ MCDA ในการเปลี่ยนข้อมูลจากหลายมิติให้กลายเป็น', 'and sustainable urban transport assessment, illustrating how MCDA converts multidimensional evidence into'],
  ['เหตุผลเชิงนโยบาย” ที่ตรวจสอบและสื่อสารได้', 'policy reasoning that can be examined and communicated.'],
  ['รู้จัก SUMR Unit ↗', 'Explore the SUMR Unit ↗'],
  ['พิจารณาความสามารถในการเข้าถึงโอกาสและบริการของประชาชน', 'Assess access to opportunities and public services.'],
  ['ประเมินประสิทธิภาพการเดินทาง เวลา ความคล่องตัว และความเชื่อมโยง', 'Evaluate travel efficiency, time, mobility, and connectivity.'],
  ['เปรียบเทียบความเสี่ยง ความปลอดภัย และผลกระทบที่ไม่ควรถูกซ่อนในคะแนนรวม', 'Compare risk, safety, and impacts that should not be obscured by a single aggregate score.'],
  ['เชื่อมเศรษฐกิจ สังคม สิ่งแวดล้อม และความเป็นธรรมเข้ากับการตัดสินใจเดียวกัน', 'Integrate economic, social, environmental, and equity considerations in one decision framework.'],
  ['โดยเฉพาะ Chapter 1: Historical Milestones in MCDM, ตาราง timeline และการจำแนก MADM/MODM', 'Especially Chapter 1: Historical Milestones in MCDM, the historical timeline, and the MADM/MODM classification.'],
  ['รากของ fuzzy MCDM, Bellman–Zadeh และ intelligent techniques', 'Foundations of fuzzy MCDM, Bellman–Zadeh, and intelligent techniques.'],
  ['ปัญหาการเลือกวิธี, taxonomy 56 methods และ decision-tree framework', 'The method-selection problem, the 56-method taxonomy, and the decision-tree framework.'],
  ['ข้อมูลหน่วยวิจัยการขนส่งในเมืองอย่างยั่งยืน สาขาวิชาวิศวกรรมโยธา มทร.อีสาน วิทยาเขตขอนแก่น และตัวอย่างผลงานด้าน MCDA/การขนส่ง', 'Information on the Sustainable Urban Mobility Research Unit and examples of MCDA applications in transport.'],
  ['สาขาวิชาวิศวกรรมโยธา คณะวิศวกรรมศาสตร์', 'Department of Civil Engineering, Faculty of Engineering'],
  ['มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น', 'Rajamangala University of Technology Isan, Khon Kaen Campus'],
  ['ยังไม่ได้ตั้งค่า Google OAuth บนเซิร์ฟเวอร์', 'Google OAuth is not configured on the server.'],
  ['ไม่สามารถส่ง OTP ได้', 'Unable to send the verification code.'],
  ['ยืนยัน OTP ไม่สำเร็จ', 'Verification failed.'],
  ['ระบบยังไม่ได้ตั้งค่าบัญชีผู้รับเงินสำหรับตรวจสอบ กรุณาติดต่อผู้ดูแล', 'The payment recipient account is not configured for verification. Please contact the administrator.'],
  ['บัญชีผู้รับเงินในสลิปไม่ตรงกับบัญชี PromptPay ของระบบ กรุณาตรวจสอบว่าชำระเข้าบัญชีที่ถูกต้อง', 'The recipient account on the slip does not match the configured PromptPay account. Verify the payment destination.'],
  ['ชื่อบัญชีผู้รับเงินในสลิปไม่ตรงกับผู้รับเงินของระบบ กรุณาตรวจสอบสลิปอีกครั้ง', 'The recipient name on the slip does not match the configured account holder. Please check the slip.'],
  ['ตรวจสอบสลิปผ่านแล้ว แต่ยังไม่สามารถเปิด Premium ได้ กรุณาติดต่อผู้ดูแล', 'The slip was verified, but Premium access could not be activated. Please contact the administrator.'],
  ['เกิดความขัดแย้งในการตรวจสอบสลิป กรุณาเลือกไฟล์สลิปใหม่แล้วลองอีกครั้ง', 'A slip-verification conflict occurred. Select the payment slip again and retry.'],
  ['ข้อมูลสมาชิกจากเซิร์ฟเวอร์ไม่ครบ', 'Membership data returned by the server are incomplete.'],
  ['กรุณาเลือกไฟล์สลิปก่อนกดตรวจสอบ', 'Select a payment slip before verification.'],
  ['ไม่สามารถตรวจสอบสลิปได้ กรุณาลองอีกครั้ง', 'Unable to verify the payment slip. Please try again.'],
  ['กำลังโหลดข้อมูลสมาชิก…', 'Loading membership information…'],
  ['การกด Generate นับเป็น 1 ครั้ง แม้เลือกหลายโมเดลที่อนุญาตพร้อมกัน', 'Each Generate action counts as one analysis, even when several permitted models are selected together.'],
  ['กำหนดระยะเวลา Premium', 'Premium duration'],
  ['ราคาดึงจาก MCDA_PREMIUM_WEEKLY_PRICE_THB ส่วนระยะเวลาแก้ไขได้โดยไม่ต้อง deploy ใหม่', 'Price is read from MCDA_PREMIUM_WEEKLY_PRICE_THB; the duration can be changed without redeployment.'],
  ['กำลังบันทึก…', 'Saving…'],
  ['ระบบยังไม่ได้ตั้งค่าบัญชีรับเงิน PromptPay จึงยังสร้าง QR ไม่ได้ กรุณาตั้งค่า', 'PromptPay recipient details are not configured, so a QR code cannot be generated. Configure'],
  ['สำหรับชำระ MCDA Premium', 'for MCDA Premium payment'],
  ['บัญชีรับเงินที่ตั้งค่าไว้', 'Configured recipient account'],
  ['ขั้นตอนชำระเงิน', 'Payment steps'],
  ['สแกน Standard Thai PromptPay QR นี้ด้วย Mobile Banking', 'Scan this Standard Thai PromptPay QR code with your mobile-banking app.'],
  ['ตรวจสอบชื่อผู้รับและยอด', 'Verify the recipient name and amount'],
  ['บันทึกสลิป แล้วอัปโหลดด้านล่าง', 'Save the payment slip and upload it below.'],
  ['ระบบจะส่งสลิปไปตรวจผ่าน AMS Payment Gateway และเปิด Premium หลังผ่านเงื่อนไข', 'The slip will be verified through AMS Payment Gateway. Premium access is activated only after successful verification.'],
  ['ช่องทาง:', 'Channel:'],
  ['ประเภท PromptPay:', 'PromptPay type:'],
  ['บัญชีรับเงิน:', 'Recipient account:'],
  ['รหัส:', 'Reference:'],
  ['อัปโหลดสลิป (JPEG / PNG / GIF / WebP ไม่เกิน 4 MB)', 'Upload payment slip (JPEG / PNG / GIF / WebP, maximum 4 MB)'],
  ['บาท', 'THB'],
  ['จำนวนวิเคราะห์', 'Analysis count'],
  ['อุปกรณ์', 'Device'],
  ['เว็บไซต์ต้นทาง', 'Referrer'],
  ['ยอดเงิน', 'Amount'],
  ['สกุลเงิน', 'Currency'],
  ['วิธีชำระ', 'Payment method'],
  ['อัปเดตล่าสุด', 'Last updated'],
  ['เริ่มสิทธิ์', 'Access starts'],
  ['คำสั่งชำระเงิน', 'Payment order'],
  ['ใช้งานได้ขณะนี้', 'Currently active'],
  ['ส่ง OTP ล่าสุด', 'Latest OTP sent'],
  ['จำนวนกรอกผิด', 'Failed attempts'],
  ['แหล่งสมัครสมาชิก', 'Registration source'],
  ['แนวโน้มการใช้งานตามเวลา', 'Usage trend over time'],
  ['ส่งออกไม่สำเร็จ', 'Export failed.'],
  ['ผู้เยี่ยมชมไม่ระบุตัวตน', 'Anonymous visitor'],
  ['หมวดรายงาน', 'Report section'],
  ['เฉพาะคำขอ OTP ที่ยังอยู่ในระบบ ไม่ใช่ประวัติการสมัครที่ลบไปแล้ว', 'Shows only OTP requests still retained by the system; deleted registration history is not reconstructed.'],
  ['เว็บไซต์ต้นทาง:', 'Referrer:'],
  ['เฉพาะผู้ใช้:', 'User only:'],
  ['เปิดข้อมูล', 'Open details'],
  ['ยังไม่มีข้อมูลในช่วงนี้', 'No data are available for this period.'],
  ['เรียง', 'Sort'],
  ['ชื่อ A–Z', 'Name A–Z'],
  ['กำลังโหลดประวัติผู้ใช้…', 'Loading user history…'],
  ['เปิดประวัติผู้ใช้', 'Open user history'],

];


const MCDA_ANALYSIS_PAIRS: Array<[string, string]> = [
  ['เครื่องมือสนับสนุนการตัดสินใจแบบหลายเกณฑ์แบบ Extended Multi-Method รองรับ 13 โมเดลที่คำนวณได้จาก Decision Matrix ปัจจุบัน พร้อม Technique Library จากเอกสารอ้างอิง Comparative Ranking และ Sensitivity Analysis ภายใต้ชุดน้ำหนักเดียวกัน', 'An extended multi-method MCDA workspace supporting 13 models from a common decision matrix, with a reference-based Technique Library, comparative ranking, and sensitivity analysis under the same weighting structure.'],
  ['ความสามารถหลัก', 'Core capabilities'],
  ['ขั้นตอนการใช้งาน', 'Workflow'],
  ['ระบุข้อมูล / Import Excel', 'Enter data / Import Excel'],
  ['กรอกข้อมูลบนเว็บ หรือใช้ Master Excel Format', 'Enter data directly or import the Master Excel template.'],
  ['กำหนดน้ำหนัก', 'Set criteria weights'],
  ['น้ำหนักรวมของทุกปัจจัยต้องเท่ากับ 100%', 'Criteria weights must sum to 100%.'],
  ['เลือก Cost / Benefit', 'Set criterion direction'],
  ['กำหนดทิศทางค่าที่พึงประสงค์ของแต่ละปัจจัย', 'Define each criterion as Benefit or Cost.'],
  ['เลือกโมเดลและจัดอันดับ', 'Select models and rank alternatives'],
  ['เลือกได้หลายวิธีจาก 13 โมเดลในชุดเดียวกัน พร้อมคำอธิบายสั้น ๆ ในแต่ละกล่องเพื่อช่วยเลือกเทคนิค', 'Select one or more of 13 supported models; each option includes a concise methodological cue.'],
  ['Comparative Sensitivity', 'Comparative sensitivity'],
  ['คำนวณโมเดลที่เลือกซ้ำใน Loop น้ำหนักเดียวกัน พร้อม Legend ตารางกลางเพียงชุดเดียว', 'Recompute selected models across a common weight-perturbation loop using one shared legend.'],
  ['Export และดาวน์โหลด', 'Export results'],
  ['PDF, CSV และ Excel จะเข้าสู่โฟลเดอร์ Downloads ของเบราว์เซอร์', 'PDF, CSV, and Excel files are saved through the browser download workflow.'],
  ['1. ตารางข้อมูลทางเลือก', '1. Alternative decision matrix'],
  ['แถว = ทางเลือก · คอลัมน์ = ปัจจัยที่ใช้พิจารณา', 'Rows represent alternatives; columns represent evaluation criteria.'],
  ['ดาวน์โหลด Master Excel', 'Download Master Excel'],
  ['+ เพิ่มทางเลือก', '+ Add alternative'],
  ['+ เพิ่มปัจจัย', '+ Add criterion'],
  ['การดาวน์โหลด:', 'Downloads:'],
  ['เมื่อกดปุ่มดาวน์โหลด ระบบจะส่งไฟล์ไปยังโฟลเดอร์', 'Downloaded files are sent to the browser-defined'],
  ['ตามการตั้งค่าของเบราว์เซอร์โดยอัตโนมัติ หากเบราว์เซอร์ตั้งค่า “ถามตำแหน่งบันทึกทุกครั้ง” จะปรากฏหน้าต่างเลือกตำแหน่งแทน', 'folder automatically. If the browser is configured to ask for a save location, a file dialog will be shown instead.'],
  ['Master Excel Format สำหรับ Import', 'Master Excel format for import'],
  ['แถว = ทางเลือก · คอลัมน์ B เป็นต้นไป = ปัจจัย · แถวที่ 2 = น้ำหนัก (%) · แถว “ประเภท” เป็นตัวเลือก (ถ้าไม่มี ระบบกำหนด Benefit ให้ก่อน)', 'Rows are alternatives; columns B onward are criteria; row 2 contains weights (%). The Type row is optional; omitted types default to Benefit.'],
  ['ทางเลือก', 'Alternative'],
  ['ปัจจัย 1', 'Criterion 1'],
  ['ปัจจัย 2', 'Criterion 2'],
  ['ปัจจัย 3', 'Criterion 3'],
  ['น้ำหนัก (%)', 'Weight (%)'],
  ['ประเภท (ไม่บังคับ)', 'Type (optional)'],
  ['ทางเลือก A', 'Alternative A'],
  ['ทางเลือก B', 'Alternative B'],
  ['รองรับ .xlsx, .xls, .xlsm, .xlsb และ .csv', 'Supported formats: .xlsx, .xls, .xlsm, .xlsb, and .csv'],
  ['คลิกชื่อทางเลือกหรือชื่อปัจจัยเพื่อแก้ไขได้ทันที', 'Click an alternative or criterion name to edit it.'],
  ['2–3. น้ำหนักและเกณฑ์', '2–3. Weights and criteria'],
  ['กำหนดค่าน้ำหนักและประเภทของแต่ละปัจจัย', 'Assign a weight and direction to each criterion.'],
  ['ผลรวมน้ำหนัก', 'Total weight'],
  ['ค่ายิ่งสูงยิ่งดี', 'higher values are preferred'],
  ['ค่ายิ่งต่ำยิ่งดี', 'lower values are preferred'],
  ['Models ที่ใช้กับ Decision Matrix ปัจจุบัน:', 'Models compatible with the current decision matrix:'],
  ['13 วิธีถูกจัดเป็น 3 กลุ่มตาม', 'Thirteen methods are organized into three groups by'],
  ['เป้าหมายหลักของการวิเคราะห์', 'primary analytical objective'],
  ['เป้าหมายการวิเคราะห์', 'analytical objective'],
  ['ได้แก่ คะแนนรวม/Utility, Reference–Ideal–Compromise และ Outranking พร้อมโทนสีแยกแต่ละกลุ่ม', ': Aggregate Score/Utility, Reference–Ideal–Compromise, and Outranking.'],
  ['การจัดกลุ่มช่วยเลือกวิธีตามคำถามที่ต้องการตอบ แต่ยังเลือกหลายวิธีข้ามกลุ่มได้ วิธีที่ต้องใช้ข้อมูลคนละโครงสร้าง เช่น AHP/ANP, DEMATEL, SWARA, LINMAP, DEA, fuzzy methods, ELECTRE variants และ MODM ยังคงอยู่ใน Technique Library ด้านล่าง', 'The grouping supports method selection by analytical purpose while allowing cross-group comparison. Methods requiring different inputs, including AHP/ANP, DEMATEL, SWARA, LINMAP, DEA, fuzzy methods, ELECTRE variants, and MODM, remain in the Technique Library for dedicated input modules.'],
  ['เลือกโมเดลที่ต้องการวิเคราะห์และแสดงผล', 'Select models for analysis and reporting'],
  ['(เลือกได้หลายโมเดล)', '(multiple models allowed)'],
  ['เลือกทั้งหมด', 'Select all'],
  ['คำอธิบายโทนสีของกลุ่มโมเดล', 'Model-group legend'],
  ['คะแนนรวม / Utility', 'Aggregate score / Utility'],
  ['เลือกโมเดล MCDA แบ่งตามเป้าหมายการวิเคราะห์', 'Select MCDA models by analytical objective'],
  ['Aggregate Score & Utility — สรุปคะแนนรวมและอรรถประโยชน์', 'Aggregate Score & Utility'],
  ['สรุปคะแนนรวมและอรรถประโยชน์', 'Aggregate score and utility'],
  ['เป้าหมาย: รวมผลหลายเกณฑ์เป็นคะแนนเดียวเพื่อเปรียบเทียบและจัดอันดับทางเลือกแบบ complete ranking', 'Objective: aggregate multiple criteria into a single score for complete ranking.'],
  ['5 models · โทนน้ำเงิน', '5 models'],
  ['SAW: รวมคะแนนที่ปรับมาตรฐานแล้วถ่วงด้วยน้ำหนักเกณฑ์', 'SAW: weighted sum of normalized criterion scores.'],
  ['ผลรวมคะแนนถ่วงน้ำหนัก', 'Weighted additive score'],
  ['MOORA: เปรียบเทียบผลรวมเกณฑ์ Benefit กับ Cost หลัง normalization', 'MOORA: contrasts normalized Benefit and Cost criteria.'],
  ['Benefit − Cost แบบ Ratio', 'Ratio-based Benefit − Cost'],
  ['WASPAS: ผสม Weighted Sum Model และ Weighted Product Model', 'WASPAS: combines the Weighted Sum and Weighted Product models.'],
  ['COPRAS: ประเมินความสำคัญเชิงสัดส่วนโดยรวมเกณฑ์ Benefit และ Cost', 'COPRAS: evaluates proportional significance across Benefit and Cost criteria.'],
  ['WPM: รวมประโยชน์ด้วยผลคูณของคะแนนที่ยกกำลังตามน้ำหนักเกณฑ์', 'WPM: multiplicative aggregation with criterion weights as exponents.'],
  ['Reference, Ideal & Compromise — เปรียบเทียบกับเป้าหมาย/จุดอ้างอิง', 'Reference, Ideal & Compromise'],
  ['เปรียบเทียบกับเป้าหมาย/จุดอ้างอิง', 'Reference and target comparison'],
  ['เป้าหมาย: พิจารณาความใกล้ Ideal, Reference หรือ Average solution และหาทางเลือกที่เป็น compromise ที่เหมาะสม', 'Objective: evaluate proximity to ideal, reference, or average solutions and identify suitable compromises.'],
  ['6 models · โทนม่วง', '6 models'],
  ['TOPSIS: เลือกทางเลือกที่ใกล้ Positive Ideal และไกล Negative Ideal', 'TOPSIS: prefers alternatives close to the positive ideal and distant from the negative ideal.'],
  ['ใกล้ Ideal · ไกล Anti-ideal', 'Close to ideal · far from anti-ideal'],
  ['VIKOR: หา Compromise Solution โดยพิจารณา Group Utility และ Individual Regret', 'VIKOR: derives a compromise solution from group utility and individual regret.'],
  ['Compromise solution · Q ต่ำดีกว่า', 'Compromise solution · lower Q is preferred'],
  ['EDAS: ประเมินระยะบวกและลบของแต่ละทางเลือกเมื่อเทียบกับ Average Solution', 'EDAS: evaluates positive and negative distances from the average solution.'],
  ['ระยะจาก Average Solution', 'Distance from average solution'],
  ['GRA: วัดความใกล้เคียงของแต่ละทางเลือกกับ Reference Sequence ด้วย Grey Relational Grade', 'GRA: measures similarity to a reference sequence using the Grey Relational Grade.'],
  ['ใกล้ Reference Sequence', 'Similarity to reference sequence'],
  ['ARAS: ประเมิน Utility ของแต่ละทางเลือกเมื่อเทียบกับทางเลือกอุดมคติ', 'ARAS: evaluates utility relative to an ideal alternative.'],
  ['Utility เทียบ Ideal Alternative', 'Utility relative to ideal'],
  ['DISTANCE TARGET: จัดอันดับจากระยะถ่วงน้ำหนักถึงเป้าหมายอุดมคติ', 'DISTANCE TARGET: ranks alternatives by weighted distance to an ideal target.'],
  ['ระยะถึง Ideal Target', 'Distance to ideal target'],
  ['Outranking — วิเคราะห์ความเหนือกว่าระหว่างคู่ทางเลือก', 'Outranking'],
  ['เป้าหมาย: ตรวจว่าทางเลือกหนึ่ง “เหนือกว่า” อีกทางเลือกมากน้อยเพียงใด โดยใช้ pairwise preference / concordance–discordance', 'Objective: evaluate pairwise dominance using preference or concordance–discordance relations.'],
  ['2 models · โทนเขียว', '2 models'],
  ['PROMETHEE II: เปรียบเทียบทางเลือกแบบ Outranking และสรุปด้วย Net Flow', 'PROMETHEE II: pairwise outranking summarized by net preference flow.'],
  ['Outranking · Net Flow สูงดีกว่า', 'Outranking · higher net flow is preferred'],
  ['ELECTRE I: Outranking จาก Concordance และ Discordance ระหว่างคู่ทางเลือก', 'ELECTRE I: pairwise outranking based on concordance and discordance.'],
  ['เลือกแล้ว:', 'Selected:'],
  ['โทนสีแบ่งตาม', 'Model groups reflect the'],
  ['เพื่อช่วยเลือกวิธีที่เหมาะกับคำถามการตัดสินใจ โดยยังสามารถเลือกข้ามกลุ่มและใช้หลายโมเดลพร้อมกันได้ ผล Ranking, Heatmap และ Sensitivity จะแสดงเฉพาะโมเดลที่เลือกและคำนวณตามสูตรของแต่ละวิธีแยกจากกัน', 'to support method selection while permitting multi-model comparison. Ranking, heatmap, and sensitivity outputs are calculated independently for the selected models.'],
  ['VIKOR — ค่า v (Strategy Weight)', 'VIKOR — v (strategy weight)'],
  ['ค่า v ของ VIKOR', 'VIKOR v value'],
  ['กรอกค่า v ของ VIKOR', 'Enter VIKOR v value'],
  ['v = 0 · เน้น Individual Regret (R)', 'v = 0 · emphasizes individual regret (R)'],
  ['v = 1 · เน้น Group Utility (S)', 'v = 1 · emphasizes group utility (S)'],
  ['ค่าเริ่มต้น v = 0.50 · การเปลี่ยน v สามารถเปลี่ยนค่า Q และลำดับ VIKOR ได้ โดย Sensitivity น้ำหนักจะใช้ค่า v ที่กำหนดนี้คงที่ตลอดทุก Loop', 'Default v = 0.50. Changing v may alter Q and the VIKOR ranking; weight sensitivity holds the selected v constant across all loops.'],
  ['WASPAS — ค่า λ (WSM/WPM Mixing)', 'WASPAS — λ (WSM/WPM mixing)'],
  ['ค่า lambda ของ WASPAS', 'WASPAS lambda value'],
  ['กรอกค่า lambda ของ WASPAS', 'Enter WASPAS lambda value'],
  ['λ = 0 · ใช้ WPM 100%', 'λ = 0 · 100% WPM'],
  ['λ = 1 · ใช้ WSM 100%', 'λ = 1 · 100% WSM'],
  ['ค่าเริ่มต้น λ = 0.50 · Q = λ·WSM + (1−λ)·WPM · การเปลี่ยน λ สามารถเปลี่ยนคะแนนและลำดับ WASPAS ได้ โดย Sensitivity น้ำหนักจะใช้ λ ที่กำหนดนี้คงที่ตลอดทุก Loop', 'Default λ = 0.50, where Q = λ·WSM + (1−λ)·WPM. Changing λ may alter WASPAS scores and ranking; sensitivity analysis holds λ constant across all loops.'],
  ['วิเคราะห์โมเดลที่เลือก + Sensitivity', 'Analyze selected models + sensitivity'],
  ['คืนค่าตัวอย่าง Excel', 'Restore example data'],
  ['สถานะการ Generate', 'Analysis status'],
  ['พร้อมเริ่มการวิเคราะห์', 'Ready to analyze'],
  ['ความคืบหน้าการวิเคราะห์', 'Analysis progress'],
  ['ยังไม่ได้เริ่ม Generate', 'Analysis has not started'],
  ['เวลา:', 'Elapsed time:'],
  ['วินาที', 'seconds'],
  ['Technique Library — วิธีตัดสินใจจากเอกสารอ้างอิง', 'Technique Library — reference methods'],
  ['รวบรวมวิธีจาก taxonomy 56 MCDA methods, หนังสือ MCDM 17 techniques และ fuzzy MADM/MODM classification · แยกวิธีที่คำนวณได้ด้วยข้อมูลปัจจุบันออกจากวิธีที่ต้องใช้ input เพิ่ม', 'Includes the 56-method MCDA taxonomy, 17 MCDM techniques, and fuzzy MADM/MODM classifications, separating methods supported by the current data structure from those requiring additional inputs.'],
  ['เปิดรายการวิธีทั้งหมดและสถานะการรองรับ', 'View all methods and support status'],
  ['ค้นหาเทคนิค MCDM', 'Search MCDM techniques'],
  ['ค้นหา เช่น ELECTRE, AHP, fuzzy, Goal Programming…', 'Search: ELECTRE, AHP, fuzzy, Goal Programming…'],
  ['หลักการเพิ่มวิธี:', 'Method-integration rule:'],
  ['ระบบเปิดเป็นปุ่มวิเคราะห์เฉพาะวิธีที่ใช้ Decision Matrix + Weight + Benefit/Cost ชุดเดียวกับหน้าปัจจุบันได้อย่างสมเหตุสมผล ส่วน AHP/ANP, DEMATEL, SWARA, LINMAP, DEA, fuzzy/grey-integral, ELECTRE variants, sorting และ MODM ต้องมี pairwise matrix, causal matrix, fuzzy numbers, thresholds, classes, goals/constraints หรือข้อมูลเฉพาะวิธี จึงถูกเก็บเป็น add-on library เพื่อเพิ่ม input module อย่างถูกต้องในขั้นถัดไป', 'Only methods that can validly use the current Decision Matrix, weights, and Benefit/Cost structure are enabled for direct analysis. AHP/ANP, DEMATEL, SWARA, LINMAP, DEA, fuzzy/grey-integral methods, ELECTRE variants, sorting, and MODM require method-specific inputs and remain add-on modules until those inputs are implemented.'],
  ['4. ผลการวิเคราะห์และ Ranking', '4. Analysis results and ranking'],
  ['Dynamic MCDA dashboard: แสดง Ranking score, Ranking table, Heatmap และการเปรียบเทียบเฉพาะโมเดลที่เลือก', 'Dynamic MCDA dashboard showing ranking scores, ranking tables, heatmaps, and comparisons for selected models.'],
  ['ดาวน์โหลดผล CSV', 'Download results CSV'],
  ['บันทึกรายงาน PDF (TOPSIS)', 'Save PDF report'],
  ['กรอกข้อมูลให้ครบ ตรวจสอบว่าน้ำหนักรวมเท่ากับ 100% แล้วกด “วิเคราะห์โมเดลที่เลือก + Sensitivity”', 'Complete the data, confirm that weights sum to 100%, then select Analyze selected models + sensitivity.'],
  ['5. การแปลผลแบบพรรณนา', '5. Narrative interpretation'],
  ['สรุปและตีความผล MCDA จากโมเดลที่เลือก ร่วมกับ Ranking, ความสอดคล้องระหว่างโมเดล และ Sensitivity Analysis ประมาณ 500–1000 คำ', 'Interpret selected-model results together with ranking, cross-model agreement, and sensitivity analysis in a concise analytical narrative.'],
  ['คำแปลผลแบบพรรณนาจะถูกสร้างใหม่ทุกครั้งที่กด “วิเคราะห์โมเดลที่เลือก + Sensitivity”', 'The narrative is regenerated after each analysis run.'],
  ['6. สถานะรายงาน PDF', '6. PDF report status'],
  ['ยังไม่มีรายงานที่บันทึก', 'No report has been saved.'],
  ['เปิดรายงานสำหรับ Print / Save as PDF', 'Open report for Print / Save as PDF'],
  ['ระบบจะเปิดหน้าต่าง Save File ที่โฟลเดอร์ Downloads ก่อน แล้วเขียนไฟล์ PDF ลงปลายทางโดยตรง ไม่ใช้ Blob download หรือ Data URL download', 'The browser opens a Save File dialog and writes the PDF directly to the selected destination.'],
  ['7. Sensitivity Analysis', '7. Sensitivity analysis'],
  ['5.1 ระบุปัจจัยน้ำหนักสูงสุด · 5.2 เพิ่มทีละ 10 percentage points และเฉลี่ยลดจากปัจจัยอื่นเท่า ๆ กัน · กราฟและตารางแสดงเฉพาะโมเดลที่เลือก · ใช้ Legend ตารางกลางเพียงชุดเดียวสำหรับทุกกราฟ', 'Identify the highest-weight criterion, increase it in 10-percentage-point steps, and distribute the offset proportionally across the remaining criteria. Charts and tables show only selected models with one shared legend.'],
  ['ดาวน์โหลดข้อมูล Loop เป็น CSV', 'Download sensitivity-loop CSV'],
  ['ผล Sensitivity จะแสดงหลังจากกด “วิเคราะห์โมเดลที่เลือก + Sensitivity”', 'Sensitivity results appear after the analysis is run.'],
  ['โมเดลนี้เป็น Premium · อัปเกรด 59 บาท / 7 วันเพื่อปลดล็อกทุกโมเดล', 'This model requires Premium access. Upgrade for THB 59 / 7 days to unlock all models.'],
  ['Free Account เลือกทั้งหมดได้เฉพาะ TOPSIS, PROMETHEE II, MOORA และ ELECTRE I', 'Free accounts can select all only among TOPSIS, PROMETHEE II, MOORA, and ELECTRE I.'],
  ['ใช้เมนู “อัปเกรด 59฿” ด้านขวาบน', 'Use the Upgrade option at the upper right.'],
  ['Premium 59 บาท / 7 วัน', 'Premium THB 59 / 7 days'],
  ['ไม่สามารถโหลด MCDA engine ได้:', 'Unable to load the MCDA engine:'],
];

const GLOBAL_UI_PAIRS: Array<[string, string]> = [
  ['ไม่จำกัด · ถึง', 'Unlimited · until'],
  ['วันนี้', 'Today'],
  ['เหลือ', 'remaining'],
  ['แพ็กเกจ', 'Plan'],
  ['อัปเกรด', 'Upgrade'],
  ['บาท', 'THB'],
  ['วัน', 'days'],
  ['รายการ', 'records'],
  ['ดูรายละเอียด', 'View details'],
  ['ดูทั้งหมด', 'View all'],
  ['กลับหน้าวิเคราะห์', 'Back to analysis'],
  ['ลองใหม่', 'Retry'],
];


const SITE_COMPLETION_PAIRS: Array<[string, string]> = [
  // Home / academic content
  ['สำหรับปัญหาการออกแบบ/optimization ที่มี decision space ต่อเนื่องหรือมีทางเลือกจำนวนมาก', 'for design and optimization problems with continuous or very large decision spaces'],
  ['หรือ threshold และพารามิเตอร์ภายใน ดังนั้น “เลือกวิธีผิด” อาจทำให้คำแนะนำมีคุณภาพต่ำลง แม้คำนวณถูกทุกขั้นตอนก็ตาม', 'as well as thresholds and method-specific parameters. A poorly matched method can therefore weaken the recommendation even when every calculation is technically correct.'],
  ['MCDA ไม่ได้มีหน้าที่บอกว่าโลกมีคำตอบเดียว แต่ช่วยให้ผู้ตัดสินใจเห็นว่า', 'MCDA does not claim that every problem has one objectively correct answer. It helps decision makers explain'],
  ['ทำไม', 'why'],
  ['Kahraman อธิบายว่า classic MCDM มักสมมติให้ข้อมูล เกณฑ์ และน้ำหนักมีค่าแน่นอน แต่ปัญหาจริงเต็มไปด้วยคำว่า', 'Kahraman notes that classical MCDM commonly assumes precise data, criteria, and weights, whereas real decisions often contain assessments such as'],
  ['“ค่อนข้างดี”, “เสี่ยงสูง”, “สำคัญมากกว่าเล็กน้อย” หรือข้อมูลที่ยังไม่ครบ Fuzzy set theory จึงเปิดทางให้ระดับความเป็นสมาชิก', '“fairly good,” “high risk,” or “slightly more important,” as well as incomplete information. Fuzzy set theory represents such imprecision through graded membership'],
  ['(membership) อยู่ระหว่าง 0–1 แทนการบังคับโลกให้เป็นเพียง true/false แนวคิดนี้ทำให้ fuzzy AHP, fuzzy TOPSIS,', '(membership) between 0 and 1 rather than forcing every assessment into a binary true/false form. This foundation supports fuzzy AHP, fuzzy TOPSIS,'],
  ['fuzzy outranking และ fuzzy optimization เติบโตอย่างรวดเร็ว', 'fuzzy outranking, and fuzzy optimization.'],
  ['ต่อมา AI และ intelligent optimization ถูกนำมาช่วยเรียนรู้ membership function, จัดการ preference เชิงภาษา,', 'AI and intelligent optimization were later introduced to estimate membership functions and model linguistic preferences,'],
  ['ค้นหา solution space ขนาดใหญ่ และสร้าง decision support system ที่โต้ตอบกับผู้ใช้ได้ จุดนี้เชื่อมโยงโดยตรงกับระบบ MCDA บนเว็บยุคใหม่:', 'search large solution spaces, and support interactive decision systems. These capabilities are directly relevant to modern web-based MCDA:'],
  ['ผู้ใช้ไม่ควรเห็นเพียงอันดับสุดท้าย แต่ควรเห็น sensitivity, robustness และผลจากหลายโมเดลเพื่อประเมินความมั่นคงของข้อสรุป', 'users should see not only the final ranking, but also sensitivity, robustness, and cross-model evidence needed to assess the stability of a conclusion.'],
  ['การศึกษา และโครงข่ายคมนาคมของภาคตะวันออกเฉียงเหนือและอนุภูมิภาคลุ่มน้ำโขง', 'education, and transport networks in Northeast Thailand and the Greater Mekong Subregion.'],
  ['เอกสารที่ใช้เรียบเรียงหน้านี้', 'Sources used for this page'],
  ['หมายเหตุ: แผนภาพในหน้านี้เป็นการวาดใหม่และย่อสาระจากรูป/ตารางในเอกสารแนบเพื่อการอธิบายบนเว็บ ไม่ใช่การทำสำเนาหน้าเอกสารทั้งหน้า', 'Note: diagrams on this page are redrawn and condensed from the referenced figures and tables for web explanation; they are not page reproductions.'],
  ['หน่วยวิจัยการขนส่งในเมืองอย่างยั่งยืน (SUMR Unit)', 'Sustainable Urban Mobility Research Unit (SUMR Unit)'],

  // Authentication
  ['การยืนยัน Google หมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่', 'The Google authentication request has expired or is invalid. Please try again.'],
  ['Google ไม่อนุญาตการเข้าสู่ระบบ กรุณาตรวจสอบ OAuth redirect URI', 'Google sign-in was not authorized. Verify the OAuth redirect URI.'],
  ['ไม่สามารถยืนยันอีเมลจาก Google ได้', 'The Google account email could not be verified.'],
  ['บัญชีอีเมลนี้ถูกผูกกับ Google บัญชีอื่นแล้ว', 'This email address is already linked to another Google account.'],
  ['เข้าสู่ระบบด้วย Google ไม่สำเร็จ', 'Google sign-in failed.'],
  ['กรอกรหัส OTP 6 หลักที่ส่งไปยัง', 'Enter the 6-digit verification code sent to'],

  // Billing and payment
  ['สลิปนี้ถูกใช้งานแล้ว หรือถูกผูกกับรายการชำระเงินอื่น จึงยังไม่สามารถเปิด Premium ได้', 'This payment slip has already been used or linked to another payment request, so Premium access cannot be activated.'],
  ['ไม่สามารถยืนยันสถานะสลิปซ้ำได้อย่างปลอดภัย กรุณาลองใหม่หรือติดต่อผู้ดูแล', 'The duplicate-slip status could not be verified safely. Please try again or contact the administrator.'],
  ['ยอดเงินหรือสกุลเงินในสลิปไม่ตรงกับรายการ', 'The amount or currency on the payment slip does not match this payment request'],
  ['สลิปไม่มีข้อมูลบัญชีผู้รับเพียงพอ จึงยังไม่สามารถยืนยันการชำระเงินได้', 'The payment slip does not contain sufficient recipient information for verification.'],
  ['ไม่พบเลขอ้างอิงธุรกรรมจากผู้ให้บริการ จึงยังไม่สามารถยืนยันการชำระเงินได้', 'No provider transaction reference was returned, so the payment cannot yet be verified.'],
  ['ระบบตรวจสอบสลิปขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง', 'The slip-verification service is temporarily unavailable. Please try again later.'],
  ['ผู้ให้บริการตรวจสลิปยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่', 'The slip-verification provider is temporarily unavailable. Please wait and try again.'],
  ['มีการตรวจสอบสลิปจำนวนมากในขณะนี้ กรุณารอสักครู่แล้วลองใหม่', 'The verification service is receiving a high volume of requests. Please wait and try again.'],
  ['กลับจากหน้าชำระเงินแล้ว กำลังรอ AMS webhook ยืนยันสถานะ…', 'Returned from checkout. Waiting for the AMS webhook to confirm payment status…'],
  ['กลับจากหน้าชำระเงินแล้ว กด Card / PromptPay อีกครั้งเพื่อเริ่มรายการใหม่ หากถูกตัดเงินแล้วให้ตรวจสอบสถานะก่อน', 'Returned from checkout. Start a new Card / PromptPay request only if payment was not completed; otherwise verify the existing payment first.'],
  ['ยังไม่ได้รับผลยืนยันจาก AMS กรุณากดตรวจสอบสถานะอีกครั้งภายหลัง', 'AMS has not yet confirmed the payment. Check the existing payment status again later.'],
  ['เปิดหน้าชำระเงินไม่สำเร็จ', 'Unable to open checkout.'],
  ['บันทึกแพ็กเกจไม่สำเร็จ', 'Unable to save the plan configuration.'],
  ['ข้อมูลแพ็กเกจจากเซิร์ฟเวอร์ไม่ครบ', 'Plan data returned by the server are incomplete.'],
  ['ระบบยังไม่ได้ยืนยันผลตรวจสอบสลิป กรุณาตรวจสอบสถานะ Order เดิม', 'Slip verification is not yet confirmed. Check the existing order status.'],
  ['สมาชิกและแพ็กเกจใช้งาน', 'Membership and plans'],
  ['Free สำหรับงานพื้นฐาน หรือ Premium', 'Use Free for core analysis or Premium'],
  ['เพื่อปลดล็อกทุกโมเดลและไม่จำกัดจำนวนการวิเคราะห์', 'to unlock every model and remove the daily analysis limit.'],
  ['ตรวจสอบสถานะ Order เดิม', 'Check existing order status'],
  ['วิเคราะห์ได้สูงสุด 10 ครั้ง / วัน ต่อ Account', 'Up to 10 analyses per day per account'],
  ['ใช้ได้:', 'Available models:'],
  ['ใช้วันนี้', 'Used today'],
  ['วันนับจากเวลาชำระสำเร็จ', 'days from confirmed payment'],
  ['Premium ใช้งานอยู่ · สิ้นสุด', 'Premium active · expires'],
  ['กำลังเปิดหน้าชำระเงิน…', 'Opening checkout…'],
  ['กำลังสร้างรายการ…', 'Creating payment request…'],
  ['ระยะเวลา (วัน)', 'Duration (days)'],
  ['บันทึกระยะเวลาแพ็กเกจ', 'Save plan duration'],
  ['ระบบจะพาไปหน้าชำระเงินของ Stripe ผ่าน AMS Gateway รองรับ Card และ PromptPay ตามสิทธิ์ที่เปิดใช้งาน', 'Checkout is processed through Stripe via AMS Gateway, with Card and PromptPay available according to the enabled payment configuration.'],
  ['ทุกครั้งที่กดจะเริ่มรายการใหม่และเลิกใช้รายการค้างใน MCDA โดยไม่ลบประวัติ ลิงก์ Stripe เดิมอาจยังไม่หมดอายุ โปรดใช้เฉพาะลิงก์ล่าสุดและห้ามชำระซ้ำหากถูกตัดเงินแล้ว', 'Each attempt creates a new MCDA payment request while retaining historical records. Previous Stripe links may remain active; use only the latest link and do not pay again if a charge has already occurred.'],
  ['การกลับจากหน้าชำระเงินยังไม่ถือว่าจ่ายสำเร็จ ระบบจะเปิด Premium หลังได้รับ webhook จาก AMS เท่านั้น', 'Returning from checkout does not confirm payment. Premium access is activated only after the AMS webhook is received.'],
  ['หรือชำระด้วย Standard PromptPay QR และอัปโหลดสลิปด้านล่าง', 'Alternatively, pay with the Standard PromptPay QR and upload the payment slip below.'],
  ['ใน Environment โดยเลือก', 'in the environment, using'],
  ['ตรวจสอบชื่อผู้รับและยอด', 'Verify the recipient name and amount'],
  ['ก่อนยืนยัน', 'before confirming the payment.'],
  ['รายการหมดอายุ:', 'Order expires:'],
  ['สร้างรายการชำระเงินใหม่', 'Create a new payment request'],
  ['ราคา Premium ใช้ MCDA_PREMIUM_WEEKLY_PRICE_THB เป็นแหล่งอ้างอิงเดียวทั้ง Hosted Checkout และ Standard Thai PromptPay QR ส่วนระยะเวลาแพ็กเกจเก็บใน PostgreSQL และแก้ได้โดยผู้ดูแลระบบ ช่องทางหลักใช้ AMS Hosted Checkout: MCDA ส่ง Order ไป AMS, AMS สร้าง Stripe Checkout และ redirect ผู้ใช้ไปชำระเงิน จากนั้น Stripe ส่ง webhook เข้า AMS และ AMS relay กลับ MCDA เพื่อเปิด Premium ส่วน Standard Thai PromptPay QR + อัปโหลดสลิปยังคงเป็นช่องทางสำรอง', 'Premium pricing is sourced from MCDA_PREMIUM_WEEKLY_PRICE_THB for both Hosted Checkout and Standard Thai PromptPay QR. Plan duration is stored in PostgreSQL and can be changed by an administrator. AMS Hosted Checkout is the primary flow: MCDA creates the order, AMS opens Stripe Checkout, Stripe reports payment to AMS, and AMS relays the confirmed event to MCDA. PromptPay QR with slip verification remains the fallback channel.'],

  // Admin dashboard
  ['รหัสรายการ', 'Record ID'],
  ['รหัสผู้ใช้', 'User ID'],
  ['ชื่อ', 'Name'],
  ['วันที่สร้าง', 'Created'],
  ['วิธีเข้าสู่ระบบ / Provider', 'Sign-in method / Provider'],
  ['แหล่งสมัคร', 'Registration source'],
  ['แพ็กเกจปัจจุบัน', 'Current plan'],
  ['Premium ถึง', 'Premium until'],
  ['เข้าสู่ระบบล่าสุด', 'Last sign-in'],
  ['สิทธิ์', 'Role'],
  ['เหตุการณ์', 'Event'],
  ['หน้าเว็บ', 'Page'],
  ['โมเดล', 'Model'],
  ['รหัสแพ็กเกจ', 'Plan code'],
  ['วันที่ชำระสำเร็จ', 'Paid at'],
  ['หมดอายุ', 'Expires'],
  ['วันที่ใช้ออกรายงาน', 'Report date'],
  ['วันที่', 'Date'],
  ['สิ้นสุดสิทธิ์', 'Access ends'],
  ['OTP หมดอายุ', 'OTP expires'],
  ['วันที่ยืนยันอีเมล', 'Email verified at'],
  ['คำสั่งชำระสำเร็จ', 'Paid orders'],
  ['หน้าที่มีการเข้าชม', 'Visited pages'],
  ['วิธีเข้าสู่ระบบของผู้สมัคร', 'Registration sign-in method'],
  ['แพ็กเกจปัจจุบัน · ทุกวัน', 'Current plan · all dates'],
  ['สถานะคำสั่ง · paid ใช้วันชำระ', 'Order status · paid uses payment date'],
  ['โมเดลที่ขอวิเคราะห์', 'Requested model'],
  ['ใช่', 'Yes'],
  ['ไม่', 'No'],
  ['สมัครผ่าน Premium', 'Premium-page registrations'],
  ['ออกจากระบบไม่สำเร็จ กรุณาลองใหม่', 'Sign-out failed. Please try again.'],
  ['ช่วงวันที่ไม่ถูกต้อง', 'Invalid date range.'],
  ['วันที่สมัคร · แพ็กเกจเป็นสถานะปัจจุบัน · กดชื่อเพื่อดูประวัติ', 'Registration date · plan reflects current status · select a name to view history'],
  ['กรองตามวันที่ชำระสำเร็จ · รายรับตรงกับ KPI', 'Filtered by successful payment date; revenue matches the KPI definition.'],
  ['กรองตามวันที่สร้างคำสั่งชำระเงิน · เลือก paid เพื่อใช้วันที่ชำระสำเร็จ', 'Filtered by order creation date; select paid to use the successful-payment date.'],
  ['กรองตามวันที่เริ่มสิทธิ์ · สถานะใช้งานได้คำนวณ ณ ขณะนี้', 'Filtered by subscription start date; active status is evaluated at the current time.'],
  ['นับการอนุมัติ Generate ตามโควตารายวัน ไม่ใช่การยืนยันว่าคำนวณสำเร็จ', 'Counts Generate requests authorized by the daily quota service; it does not confirm successful model computation.'],
  ['เวลาเหตุการณ์ · ไม่เก็บ Query string, OTP หรือข้อมูลรหัสผ่าน', 'Event time · query strings, OTP values, and passwords are not stored.'],
  ['กลุ่มผู้ใช้', 'User cohort'],
  ['สมัครในช่วงวันที่', 'Registered in selected period'],
  ['ทั้งหมด · ไม่จำกัดวันสมัคร', 'All users · any registration date'],
  ['ใช้งานในช่วงวันที่', 'Active in selected period'],
  ['วิธีเข้าสู่ระบบที่ผูกไว้', 'Linked sign-in method'],
  ['ยืนยันอีเมล', 'Email verification'],
  ['ผู้ใช้ทั้งหมดในระบบ · ทุกวัน', 'All users in the system · all dates'],
  ['สมัครบัญชีใหม่จากหน้า Premium · ไม่ใช่จำนวนผู้ชำระเงิน', 'New accounts attributed to the Premium page; this is not a count of payers.'],
  ['ผู้ใช้ไม่ซ้ำที่เปิดหน้าเว็บหรือขอวิเคราะห์ในช่วงนี้', 'Unique users who viewed the site or requested analysis during the selected period.'],
  ['ผู้ใช้ที่ login และใช้งาน', 'Signed-in active users over'],
  ['เริ่มเก็บ Page views, Login และแหล่งสมัครเมื่อ', 'Page views, sign-in events, and registration source have been recorded since'],
  ['ข้อมูลก่อนหน้านี้จะไม่ถูกประมาณขึ้นใหม่', 'Earlier activity is not reconstructed.'],
  ['ระบบปัจจุบันยังไม่มีข้อมูลเบอร์โทรศัพท์', 'Phone-number data are not currently collected.'],
  ['แสดงล่าสุดไม่เกิน 10 คนที่สมัครในช่วงวันที่เลือก', 'Shows up to the 10 most recent registrations in the selected period.'],
  ['อ่านข้อมูลเท่านั้น · ส่งออกสูงสุด 10,000 รายการต่อตัวกรอง · ไม่มีการแสดงรหัสผ่าน OTP หรือข้อมูลลับของ Payment Gateway', 'Read-only analytics · exports are limited to 10,000 records per filter · passwords, OTP values, and payment-gateway secrets are never displayed.'],
  ['Page views ในช่วงนี้', 'Page views in this period'],
  ['การวิเคราะห์ในช่วงนี้', 'Analyses in this period'],
  ['ชำระสำเร็จในช่วงนี้', 'Successful payments in this period'],
  ['ดูเหตุการณ์ทั้งหมด', 'View all events'],
  ['ดูการวิเคราะห์', 'View analyses'],
  ['ดูการชำระเงิน', 'View payments'],
  ['ดูสิทธิ์สมาชิก', 'View membership'],
  ['รายละเอียดกิจกรรมใช้ช่วง', 'Activity details use the period'],
  ['เปลี่ยนช่วงวันที่เพื่อดูประวัติช่วงอื่น', 'Change the date range to inspect another period.'],
  ['เปิดประวัติผู้ใช้', 'Open user history'],
  ['MCDA · รายละเอียด', 'MCDA · Details'],
  ['ปิดรายละเอียด', 'Close details'],
  ['เลือกตัวชี้วัดเพื่อเปรียบเทียบรายวัน แล้วคลิกจุดเพื่อดูรายการของวันนั้น', 'Select a metric for daily comparison, then select a point to inspect that day.'],
  ['รายวัน · เวลาไทย', 'Daily · Asia/Bangkok'],
  ['กราฟรายวัน', 'Daily chart'],
  ['คลิกดูรายละเอียด', 'select to view details'],
  ['ตรวจสอบการลงทะเบียน สมาชิก และพฤติกรรมการใช้งานในที่เดียว', 'Review registrations, membership, payments, and usage in one administrative view.'],
  ['อัปเดต', 'Updated'],
  ['รวมวันเริ่มต้นและสิ้นสุด', 'inclusive of start and end dates'],
  ['เริ่มต้น', 'Start'],
  ['สิ้นสุด', 'End'],
  ['แสดง', 'Show'],
  ['ข้อมูลผู้ใช้', 'User details'],
  ['ข้อมูลรายการ', 'Record details'],

  // Admin access/error states
  ['โหลดระบบผู้ดูแลไม่สำเร็จ', 'Unable to load the administrator console'],
  ['ไม่สามารถตรวจสอบข้อมูลได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล', 'The administrator data could not be loaded. Verify the database connection and try again.'],
  ['ไม่มีสิทธิ์เข้าถึง Admin', 'Administrator access required'],
  ['บัญชีนี้ไม่ได้รับสิทธิ์ผู้ดูแล หรือยังไม่ได้ยืนยันอีเมล', 'This account does not have administrator access or its email address has not been verified.'],

  // Symbols
  ['฿', ' THB'],
];


const DYNAMIC_UI_PAIRS: Array<[string, string]> = [
  ['ไม่สามารถตรวจสอบสลิปได้:', 'Unable to verify the payment slip:'],
  ['สร้างรายการชำระเงิน', 'Created payment request for'],
  ['บาทแล้ว', 'THB.'],
  ['อัปเดต Premium เป็น', 'Premium updated to'],
  ['วันแล้ว', 'days.'],
  ['บาทสำเร็จ เปิดใช้งาน Premium แล้ว', 'THB confirmed. Premium access is active.'],
  ['ชำระ Card / PromptPay', 'Pay by Card / PromptPay'],
  ['เปิด Premium', 'activate Premium'],
  ['ชำระเงิน', 'Payment'],
  ['ชำระ ', 'Pay '],
  ['/ 10 ครั้ง · เหลือ', '/ 10 analyses · remaining'],
  ['ครั้ง', 'analyses'],
  ['รวม', 'Total'],
  ['ผู้สมัคร', 'Registrants'],
  ['คนในช่วงนี้ไม่ทราบแหล่งสมัคร', 'users in this period have an unknown registration source'],
  ['คน', 'users'],
  ['วัน', 'days'],
  ['และ', 'and'],
];

function translateText(input: string) {
  let output = input;
  for (const [th, en] of [...PAIRS, ...MCDA_ANALYSIS_PAIRS, ...SITE_COMPLETION_PAIRS, ...DYNAMIC_UI_PAIRS, ...GLOBAL_UI_PAIRS].sort((a, b) => b[0].length - a[0].length)) output = output.split(th).join(en);
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
