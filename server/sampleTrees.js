// Dữ liệu mẫu khởi tạo cho tài khoản mới.
// Cấu trúc: persons (map id -> person), unions (map id -> {partners[], children[]}), rootId.
// Thứ tự trong partners = thứ tự hiển thị trái -> phải (chồng sát bên trái vợ cả).
// Thứ tự trong children = con cả -> con út, trái -> phải.

function person(id, name, gender, birth = '', death = '', note = '') {
  return { id, name, gender, birth, death, note, avatar: null };
}

export function sampleTreeNguyen() {
  const persons = {};
  const add = (...args) => { const p = person(...args); persons[p.id] = p; return p.id; };

  // Đời 1 — cụ tổ có hai bà vợ
  add('p1', 'Nguyễn Phúc Tổ', 'male', '1898', '1968', 'Cụ tổ đời thứ nhất, quê Hà Đông. Làm nghề dạy học.');
  add('p2', 'Trần Thị Nhu', 'female', '1902', '1975', 'Vợ cả, quê Sơn Tây.');
  add('p3', 'Lê Thị Hòa', 'female', '1910', '1990', 'Vợ hai, quê Bắc Ninh.');

  // Đời 2
  add('p4', 'Nguyễn Phúc Trường', 'male', '1925', '1998', 'Con trưởng, con bà cả.');
  add('p5', 'Phạm Thị Lan', 'female', '1930', '2005', 'Vợ ông Trường.');
  add('p6', 'Nguyễn Thị Mai', 'female', '1928', '', 'Con thứ hai, con bà cả.');
  add('p7', 'Nguyễn Phúc Bình', 'male', '1932', '2010', 'Con thứ ba, con bà hai.');
  add('p8', 'Đỗ Thị Cúc', 'female', '1936', '', 'Vợ ông Bình.');
  add('p9', 'Nguyễn Phúc An', 'male', '1938', '', 'Con út, con bà hai.');

  // Đời 3
  add('p10', 'Nguyễn Phúc Minh', 'male', '1952', '', 'Con trưởng ông Trường. Kỹ sư xây dựng.');
  add('p11', 'Vũ Thị Thu', 'female', '1956', '', 'Vợ ông Minh.');
  add('p12', 'Nguyễn Thị Hương', 'female', '1955', '', 'Con thứ ông Trường. Giáo viên.');
  add('p13', 'Nguyễn Phúc Quang', 'male', '1960', '', 'Con trai ông Bình. Bác sĩ.');

  // Đời 4
  add('p14', 'Nguyễn Phúc Khang', 'male', '1980', '', 'Con trưởng ông Minh.');
  add('p15', 'Nguyễn Thị Linh', 'female', '1984', '', 'Con gái ông Minh.');

  const unions = {
    u1: { id: 'u1', partners: ['p1', 'p2', 'p3'], children: ['p4', 'p6', 'p7', 'p9'] },
    u2: { id: 'u2', partners: ['p4', 'p5'], children: ['p10', 'p12'] },
    u3: { id: 'u3', partners: ['p7', 'p8'], children: ['p13'] },
    u4: { id: 'u4', partners: ['p10', 'p11'], children: ['p14', 'p15'] },
  };

  return { version: 1, persons, unions, rootId: 'u1' };
}

export function sampleTreeTran() {
  const persons = {};
  const add = (...args) => { const p = person(...args); persons[p.id] = p; return p.id; };

  // Đời 1 — ví dụ một bà có hai đời chồng
  add('p1', 'Trần Văn Kiên', 'male', '1900', '1945', 'Chồng cả.');
  add('p2', 'Ngô Thị Bích', 'female', '1905', '1988', 'Cụ bà, tái giá sau khi chồng cả mất.');
  add('p3', 'Phan Văn Lâm', 'male', '1902', '1980', 'Chồng hai.');

  // Đời 2
  add('p4', 'Trần Văn Dũng', 'male', '1930', '2001', 'Con ông Kiên.');
  add('p5', 'Lý Thị Hạnh', 'female', '1934', '', 'Vợ ông Dũng.');
  add('p6', 'Phan Thị Ngọc', 'female', '1948', '', 'Con ông Lâm.');

  // Đời 3
  add('p7', 'Trần Văn Hải', 'male', '1958', '', 'Con trai ông Dũng.');

  const unions = {
    u1: { id: 'u1', partners: ['p1', 'p2', 'p3'], children: ['p4', 'p6'] },
    u2: { id: 'u2', partners: ['p4', 'p5'], children: ['p7'] },
  };

  return { version: 1, persons, unions, rootId: 'u1' };
}
