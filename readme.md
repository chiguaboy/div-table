1. 表格左侧新增固定列，展示行号.固定列没有列头，不可调整列宽。
2. 点击行号选中该行，shift操作支持选中多行
3. 实现以下api,并通过defineExpose对外提供:
   1. renameTable,重命名表名
   2. refreshData，刷新数据
   3. setColumnWidthMode，设置列宽模式（`fixed` / `label` / `auto`）
   4. setColumnWidth，设置指定目标列的列宽
   5. setRowHeight,设置所有行的行高
   6. setFont，设置全表字体和字体大小
   7. setAlign,设置全表文字align
   8. setScrollOffset，设置表格滚动状态
   9. renameColumn,重命名列
   10. changeColumnVisible,设置列可见性
   11. locateColumn,滚动定位到目标列
   12. setColumnAlign,设置目标列的文字align
   13. matchRow,选中并高亮目标行，支持多行
   14. reserveMatchRow,选中并高亮目标行之外的行
   15. setSelectedRows,设置选中行（支持单行/多行）
4. 支持框选行号选中对应行，行号支持control+鼠标左键选中非连续的行
5. 提供api，支持设置选中行
6. 行选择操作会清空之前的框选与点选结果，框选操作也会清空之前的行选择结果，点选操作会清空之前的选择结果
7. 将行号列的宽度计入到横向滚动条的计算中，横向滚动条起点为表格最左侧
8. S

1. 表格列宽支持两种模式:固定宽度与以列名字符长度自适应，提供api支持模式切换设置
2. 表格行高以字体大小自适应
3. 单元格内容不换行，内容超出时显示...，鼠标hover以tooltip形式展示完整内容
4. 数据选择优化，选择操作不区分行号列与普通数据列，单元格操作也支持control/shift+鼠标组合选择。行号列统一设置data-col=-1，选择结束后通过该属性判断行号列是否被选中，是否需要整行高亮
